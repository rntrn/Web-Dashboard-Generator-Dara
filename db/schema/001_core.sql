-- =====================================================================
-- DARA FREE — 001_core.sql
-- Skema inti: tabel METADATA milik DARA sendiri (bukan sumber data).
--
-- Target   : MySQL 8.0+ (kompatibel MariaDB 10.5+)
-- Prefix   : dara_*        → metadata aplikasi
--            dara_data_*   → sumber data yang boleh dibaca dashboard
-- Charset  : utf8mb4 / utf8mb4_unicode_ci
-- Engine   : InnoDB (transaksi + foreign key)
--
-- ---------------------------------------------------------------------
-- POLA PENYIMPANAN: "dokumen + proyeksi"  ← BACA INI DULU
-- ---------------------------------------------------------------------
-- Aplikasi DARA menyimpan chart/dashboard/story sebagai objek JSON yang
-- bentuknya berkembang tiap versi (kolom baru muncul terus). Kalau tiap
-- kolom JS dipetakan ke kolom SQL, setiap fitur baru butuh ALTER TABLE
-- dan risiko data hilang saat versi client & server tidak sinkron.
--
-- Karena itu tiap tabel metadata punya:
--   * kolom `doc JSON`  → SUMBER KEBENARAN. Dokumen utuh apa adanya.
--   * kolom biasa       → PROYEKSI dari isi `doc`. Ditulis ulang oleh
--                         aplikasi setiap kali `doc` disimpan.
--
-- Kolom proyeksi ada supaya:
--   - bisa di-query & di-index dari SQL (laporan, audit, backup selektif)
--   - isi tabel enak dibaca manusia lewat DBeaver/phpMyAdmin
--   - bisa dipasangi FOREIGN KEY
--
-- ATURAN: aplikasi menulis `doc` DAN proyeksinya bersamaan. Jangan pernah
-- meng-UPDATE kolom proyeksi secara manual dan berharap aplikasi ikut
-- berubah — yang dibaca aplikasi adalah `doc`.
--
-- Idempotent: semua CREATE memakai IF NOT EXISTS, aman dijalankan ulang.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Pelacak migrasi
--    Installer menuliskan satu baris tiap file SQL yang berhasil jalan.
--    Ini yang membuat `npm run db:migrate` aman diulang.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_schema_migrations (
  version     VARCHAR(20)  NOT NULL,
  name        VARCHAR(120) NOT NULL,
  checksum    CHAR(64)     NULL COMMENT 'sha256 isi file, untuk deteksi file yang diubah setelah dijalankan',
  applied_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Riwayat migrasi skema yang sudah diterapkan';

-- ---------------------------------------------------------------------
-- 1. Pengaturan aplikasi (singleton, selalu id = 1)
--    Pengganti server/data/settings.json
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_settings (
  id              TINYINT UNSIGNED NOT NULL DEFAULT 1,
  admin_user      VARCHAR(50)   NOT NULL DEFAULT 'admin',
  admin_hash      VARCHAR(100)  NOT NULL COMMENT 'bcrypt hash password admin lokal',
  app_name        VARCHAR(100)  NOT NULL DEFAULT 'DARA Free',
  dev_mode        TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1 = lewati auth, HANYA untuk development',
  acl_enabled     TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '1 = kepemilikan chart/dashboard ditegakkan',
  upload_enabled  TINYINT(1)    NOT NULL DEFAULT 1 COMMENT '1 = fitur upload CSV/Excel aktif',
  doc             JSON          NOT NULL COMMENT 'dokumen settings utuh (sumber kebenaran)',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Pengaturan global aplikasi, hanya boleh 1 baris';

-- ---------------------------------------------------------------------
-- 2. Peran (role) dan daftar izinnya
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_roles (
  kode        VARCHAR(30)  NOT NULL COMMENT 'admin | editor | viewer | custom',
  nama        VARCHAR(80)  NOT NULL,
  deskripsi   VARCHAR(255) NULL,
  permissions JSON         NOT NULL COMMENT 'array izin, mis. ["chart:read","dashboard:write"]',
  is_system   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 = bawaan, tidak boleh dihapus',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Peran pengguna dan daftar izinnya';

-- ---------------------------------------------------------------------
-- 3. Pengguna
--    TIDAK ADA tabel dara_users terpisah di versi ini.
--
--    Keputusan desain: pengguna aplikasi = pegawai yang diberi akses login.
--    Identitasnya hidup di db/schema/002_sample_tables.sql sebagai kolom
--    tambahan pada `dara_data_pegawai` (email, password_hash, role_kode,
--    is_user, ...), bukan tabel metadata terpisah. Satu orang = satu baris,
--    baik dia hanya data HR maupun juga bisa login.
--
--    KENAPA tidak lewat metaStore seperti koleksi lain (charts/dashboards)?
--    metaStore.writeAll() men-DELETE seluruh tabel lalu INSERT ulang —
--    aman untuk koleksi kecil yang SEPENUHNYA dikuasai aplikasi, tapi kalau
--    dipakai di sini akan menghapus SEMUA data HR pegawai setiap kali satu
--    akun pengguna diubah. Karena itu server/src/modules/users/ mengakses
--    dara_data_pegawai lewat SQL baris-per-baris sendiri (lihat
--    users.repository.js), bukan lewat metaStore.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4. Chart tersimpan
--    Pengganti server/data/charts.json
--    Isi `doc`: { id, name, table, chartType, dimensions[], measures[],
--                 aggregation, join, filters, format, createdBy, sharedWith,
--                 createdAt, updatedAt }
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_charts (
  id          VARCHAR(64)  NOT NULL COMMENT 'id acak dari aplikasi (bukan auto-increment)',
  nama        VARCHAR(150) NULL,
  chart_type  VARCHAR(30)  NULL COMMENT 'bar|line|area|pie|donut|scatter|metric|gauge|map|table|...',
  table_name  VARCHAR(120) NULL COMMENT 'tabel sumber utama (dara_data_*)',
  owner_nip   VARCHAR(30)  NULL COMMENT 'pemilik, NULL berarti milik sistem',
  shared_with JSON         NULL COMMENT 'array nip yang diberi akses baca',
  doc         JSON         NOT NULL COMMENT 'spesifikasi chart utuh (sumber kebenaran)',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_charts_owner (owner_nip),
  KEY idx_charts_table (table_name),
  KEY idx_charts_type (chart_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Chart yang disimpan pengguna';

-- ---------------------------------------------------------------------
-- 5. Dashboard
--    Pengganti server/data/dashboards.json
--    Isi `doc`: { id, name, items[{id,kind,chartId,x,y,w,h}], slicers[],
--                 theme, logo, subtitle, createdBy, sharedWith, ... }
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_dashboards (
  id          VARCHAR(64)  NOT NULL,
  nama        VARCHAR(150) NULL,
  subjudul    VARCHAR(255) NULL,
  tema        VARCHAR(30)  NULL,
  owner_nip   VARCHAR(30)  NULL,
  shared_with JSON         NULL,
  jumlah_item INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'proyeksi: banyak widget dalam grid',
  status      ENUM('DRAFT','LIVE','ARSIP') NOT NULL DEFAULT 'DRAFT',
  doc         JSON         NOT NULL COMMENT 'dashboard utuh termasuk layout grid',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dash_owner (owner_nip),
  KEY idx_dash_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Dashboard (kumpulan chart dalam grid 12 kolom)';

-- ---------------------------------------------------------------------
-- 6. Story — rangkaian dashboard jadi presentasi bertahap
--    Isi `doc`: { id, name, steps[{id,dashboardId,title,narasi}],
--                 createdBy, sharedWith, embedKey }
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_stories (
  id            VARCHAR(64)  NOT NULL,
  nama          VARCHAR(150) NULL,
  owner_nip     VARCHAR(30)  NULL,
  shared_with   JSON         NULL,
  jumlah_langkah INT UNSIGNED NOT NULL DEFAULT 0,
  doc           JSON         NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_story_owner (owner_nip)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Story: presentasi bertahap dari beberapa dashboard';

-- ---------------------------------------------------------------------
-- 7. Kunci embed — untuk viewer publik /view/:id
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_embeds (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dashboard_id  VARCHAR(64)  NOT NULL,
  embed_key     CHAR(32)     NOT NULL COMMENT 'kunci acak pada URL embed',
  allow_filter  TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1 = filter boleh dikirim lewat query string',
  expires_at    DATETIME     NULL COMMENT 'NULL = tidak kedaluwarsa',
  status        ENUM('AKTIF','NONAKTIF') NOT NULL DEFAULT 'AKTIF',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_embed_key (embed_key),
  KEY idx_embed_dash (dashboard_id),
  CONSTRAINT fk_embed_dashboard FOREIGN KEY (dashboard_id)
    REFERENCES dara_dashboards (id) ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Kunci akses viewer publik per dashboard';

-- ---------------------------------------------------------------------
-- 8. Relasi antar tabel data (override manual deteksi *_id)
--    Pengganti server/config/relations.json
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_relations (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  from_table   VARCHAR(120) NOT NULL,
  from_column  VARCHAR(120) NOT NULL,
  to_table     VARCHAR(120) NOT NULL,
  to_column    VARCHAR(120) NOT NULL,
  join_type    ENUM('INNER','LEFT') NOT NULL DEFAULT 'LEFT',
  catatan      VARCHAR(255) NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_relation (from_table, from_column, to_table, to_column)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Relasi antar tabel data untuk chart lintas-tabel (JOIN)';

-- ---------------------------------------------------------------------
-- 9. Riwayat upload CSV/Excel
--    Pengganti server/data/uploads.json
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_uploads (
  id            VARCHAR(64)  NOT NULL COMMENT 'id dokumen dari aplikasi',
  table_name    VARCHAR(120) NOT NULL COMMENT 'tabel hasil, mis. dara_data_upl_penjualan',
  filename      VARCHAR(255) NULL,
  format        VARCHAR(10)  NULL COMMENT 'CSV | XLSX | JSON',
  total_rows    INT UNSIGNED NOT NULL DEFAULT 0,
  failed_rows   INT UNSIGNED NOT NULL DEFAULT 0,
  owner_nip     VARCHAR(30)  NULL,
  shared_with   JSON         NULL,
  doc           JSON         NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_upload_table (table_name),
  KEY idx_upload_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Riwayat impor data dari berkas';

-- ---------------------------------------------------------------------
-- 10. Log aktivitas (append-only, dipangkas oleh aplikasi ke N terbaru)
--     Pengganti server/data/activity.json
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_activity (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ts           DATETIME     NOT NULL COMMENT 'waktu kejadian menurut aplikasi',
  actor_nip    VARCHAR(30)  NULL,
  actor_nama   VARCHAR(120) NULL,
  aksi         VARCHAR(60)  NOT NULL COMMENT 'login|create|update|delete|share',
  target       VARCHAR(40)  NULL COMMENT 'chart|dashboard|story|upload|appconfig',
  detail       VARCHAR(255) NULL,
  doc          JSON         NOT NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_act_ts (ts),
  KEY idx_act_actor (actor_nip),
  KEY idx_act_target (target)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Jejak audit aktivitas pengguna';

-- ---------------------------------------------------------------------
-- 11. Konfigurasi tampilan (identitas app, tema, logo)
--     Pengganti server/data/appconfig.json yang berukuran besar.
--     Dipecah per-key supaya tidak menulis ulang seluruh berkas tiap ubah.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_appconfig (
  scope       VARCHAR(40)  NOT NULL COMMENT 'kelompok konfigurasi, mis. "brand", "theme", "geo"',
  config_key  VARCHAR(120) NOT NULL,
  value       JSON         NOT NULL,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Konfigurasi aplikasi bentuk key-value';
