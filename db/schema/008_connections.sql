-- =====================================================================
-- DARA FREE — 008_connections.sql
-- Fitur "Data Connection": koneksi ke database eksternal (sebelum
-- alur Jelajah Data / Chart Builder). Lihat docs/07-data-connection.md
-- untuk arsitektur driver-adapter lengkapnya.
--
-- Mengikuti pola "dokumen + proyeksi" yang sama seperti 001_core.sql —
-- baca komentar di kepala file itu dulu bila belum familiar.
--
-- KEAMANAN — BACA INI:
-- Kolom `doc` BOLEH berisi host/port/nama-database/username (bukan
-- rahasia), tapi PASSWORD TIDAK PERNAH disimpan plaintext di sini.
-- Aplikasi menyimpannya sebagai `doc.secretEnc` — hasil enkripsi
-- AES-256-GCM lewat server/src/lib/secretCipher.js. Kalau suatu saat
-- Anda melihat field password polos di kolom `doc` lewat DBeaver/phpMyAdmin,
-- itu BUG — laporkan / perbaiki sebelum dipakai produksi.
-- =====================================================================

CREATE TABLE IF NOT EXISTS dara_connections (
  id          VARCHAR(64)  NOT NULL COMMENT 'id acak dari aplikasi, mis. conn_1699999999_123',
  nama        VARCHAR(150) NULL,
  driver      VARCHAR(30)  NOT NULL COMMENT 'kunci driver, mis. mysql|postgres — lihat drivers/registry.js',
  status      ENUM('BELUM_DITES','AKTIF','GAGAL') NOT NULL DEFAULT 'BELUM_DITES' COMMENT 'proyeksi hasil test-connection terakhir',
  owner_nip   VARCHAR(30)  NULL COMMENT 'admin yang membuat koneksi ini',
  doc         JSON         NOT NULL COMMENT 'dokumen utuh: {config:{host,port,database,user,ssl}, secretEnc, status, lastTestedAt, lastError, createdBy}. Password HANYA lewat secretEnc (AES-256-GCM), tidak pernah plaintext.',
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_conn_owner (owner_nip),
  KEY idx_conn_driver (driver)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Koneksi database eksternal (menu Data Connection)';
