-- =====================================================================
-- DARA FREE — 002_sample_tables.sql
-- Tabel SUMBER DATA contoh (prefix dara_data_).
--
-- Kenapa ada prefix?
--   Server hanya menampilkan tabel yang namanya diawali DB_TABLE_PREFIX
--   (default: dara_data_). Jadi tabel metadata dara_* dan tabel milik
--   aplikasi lain di database yang sama tidak ikut terlihat di UI.
--
-- Empat tabel ini sengaja dipilih supaya semua fitur DARA bisa dicoba:
--   dara_data_penjualan  → time series, kategori, KPI, drill-down
--   dara_data_pegawai    → distribusi, gender, JOIN via unit_id
--   dara_data_unit       → tabel dimensi (pasangan JOIN pegawai)
--   dara_data_lokasi     → peta, layer titik/marker (lat/lon)
--                          (layer area/choropleth ada di tabel terpisah
--                          dara_data_provinsi, lihat 006_data_provinsi.sql)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabel dimensi: unit kerja
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_data_unit (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  kode       VARCHAR(20)  NOT NULL,
  nama       VARCHAR(120) NOT NULL,
  wilayah    VARCHAR(60)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_unit_kode (kode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Contoh tabel dimensi unit kerja';

-- ---------------------------------------------------------------------
-- Fakta: transaksi penjualan harian
-- Kolom tanggal + angka + beberapa dimensi kategori = bahan ideal untuk
-- usulan chart otomatis (line, bar, pie, KPI).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_data_penjualan (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tanggal       DATE          NOT NULL,
  kota          VARCHAR(60)   NOT NULL,
  provinsi      VARCHAR(60)   NOT NULL,
  kategori      VARCHAR(40)   NOT NULL,
  produk        VARCHAR(80)   NOT NULL,
  kanal         VARCHAR(20)   NOT NULL COMMENT 'Online | Offline | Mitra',
  qty           INT           NOT NULL,
  harga_satuan  DECIMAL(14,2) NOT NULL,
  total         DECIMAL(16,2) NOT NULL,
  sales_rep     VARCHAR(80)   NOT NULL,
  PRIMARY KEY (id),
  KEY idx_penjualan_tanggal (tanggal),
  KEY idx_penjualan_provinsi (provinsi),
  KEY idx_penjualan_kategori (kategori)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Contoh tabel fakta penjualan';

-- ---------------------------------------------------------------------
-- Fakta: data pegawai — SEKALIGUS tabel identitas pengguna aplikasi.
--
-- unit_id mengikuti konvensi *_id → relasi ke dara_data_unit terdeteksi
-- otomatis oleh fitur chart lintas-tabel.
--
-- KOLOM HR (unit_id..gaji_pokok) NULLABLE dengan sengaja: tidak semua
-- pengguna aplikasi adalah pegawai struktural (mis. akun admin sistem
-- tanpa jabatan formal). Sebaliknya, tidak semua pegawai HR punya akun
-- login — itu sebabnya ada flag `is_user`.
--
-- is_user = 0  → baris murni data HR (contoh: pegawai hasil generate-sample)
-- is_user = 1  → baris ini adalah akun aplikasi, WAJIB punya email
--
-- KOLOM SENSITIF: password_hash TIDAK PERNAH boleh terekspos lewat API
-- data generik (Jelajah Data / Chart Builder). Ini ditegakkan di kode
-- (databases.repository.js menyaring nama kolom ini dari getTableInfo),
-- bukan cuma di dokumen ini — tapi baca ini sebagai pengingat kalau Anda
-- menambah kolom sensitif baru di masa depan, tambahkan juga ke daftar
-- saring itu.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_data_pegawai (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nip            VARCHAR(30)  NOT NULL COMMENT 'identitas unik, identifier login alternatif (maks 30 karakter, bukan hanya digit)',
  nama           VARCHAR(120) NOT NULL,

  -- --- Kolom akun (NULL bila pegawai ini bukan pengguna aplikasi) ---
  email          VARCHAR(150)  NULL COMMENT 'identifier login alternatif, UNIQUE tapi boleh banyak NULL',
  password_hash  VARCHAR(100)  NULL COMMENT 'bcrypt, NULL = belum bisa login. JANGAN PERNAH diekspos lewat API data generik',
  role_kode      VARCHAR(30)   NOT NULL DEFAULT 'viewer' COMMENT 'FK dara_roles, berlaku hanya bila is_user=1',
  status         ENUM('AKTIF','NONAKTIF') NOT NULL DEFAULT 'AKTIF',
  is_user        TINYINT(1)    NOT NULL DEFAULT 0 COMMENT '1 = baris ini adalah akun aplikasi (bisa login)',
  last_login_at  DATETIME      NULL,
  doc            JSON          NULL COMMENT 'dokumen akun (pola dokumen+proyeksi), NULL bila is_user=0',

  -- --- Kolom HR (NULL bila akun ini bukan pegawai struktural) ---
  unit_id        INT UNSIGNED  NULL,
  jabatan        VARCHAR(80)   NULL,
  golongan       VARCHAR(10)   NULL,
  gender         ENUM('L','P') NULL,
  tanggal_masuk  DATE          NULL,
  gaji_pokok     DECIMAL(14,2) NULL,

  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_pegawai_nip (nip),
  UNIQUE KEY uq_pegawai_email (email),
  KEY idx_pegawai_unit (unit_id),
  KEY idx_pegawai_is_user (is_user),
  KEY idx_pegawai_role (role_kode),
  CONSTRAINT fk_pegawai_unit FOREIGN KEY (unit_id)
    REFERENCES dara_data_unit (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT fk_pegawai_role FOREIGN KEY (role_kode)
    REFERENCES dara_roles (kode) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Pegawai DAN identitas pengguna aplikasi (satu tabel, lihat catatan di atas)';

-- ---------------------------------------------------------------------
-- Geo: titik lokasi untuk fitur peta
-- Kolom lat/lon dikenali otomatis sebagai layer titik/marker. Kolom
-- `provinsi` di sini HANYA teks biasa untuk pengelompokan/filter — bukan
-- data geometri, jadi TIDAK terdeteksi sebagai layer area. Layer area
-- (choropleth) datang dari tabel terpisah dara_data_provinsi (kolom
-- geojson), lihat 006_data_provinsi.sql.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dara_data_lokasi (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nama        VARCHAR(120)  NOT NULL,
  jenis       VARCHAR(40)   NOT NULL COMMENT 'Kantor | Gudang | Outlet',
  provinsi    VARCHAR(60)   NOT NULL,
  kota        VARCHAR(60)   NOT NULL,
  lat         DECIMAL(10,6) NOT NULL,
  lon         DECIMAL(10,6) NOT NULL,
  kapasitas   INT           NOT NULL,
  PRIMARY KEY (id),
  KEY idx_lokasi_provinsi (provinsi)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Contoh tabel lokasi untuk peta berlapis';
