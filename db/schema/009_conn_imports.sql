-- =====================================================================
-- DARA FREE — 009_conn_imports.sql
-- Fitur "Data Connection" Fase 1: import/materialize. Tabel INI menyimpan
-- METADATA tabel hasil tarik-data dari koneksi eksternal (dara_connections,
-- lihat 008_connections.sql) — BUKAN kredensial, BUKAN data itu sendiri.
--
-- Data hasil tarik disimpan sebagai tabel BARU terpisah
-- `dara_data_conn_*` (dibuat dinamis oleh
-- server/src/modules/connections/connImports.service.js, sama seperti
-- dara_data_upl_* untuk hasil upload CSV/Excel — lihat 001_core.sql
-- bagian dara_uploads untuk pola yang identik).
--
-- Mengikuti pola "dokumen + proyeksi" yang sama seperti 001_core.sql/
-- 008_connections.sql — baca komentar di kepala 001_core.sql dulu bila
-- belum familiar.
-- =====================================================================

CREATE TABLE IF NOT EXISTS dara_conn_imports (
  id             VARCHAR(64)  NOT NULL COMMENT 'id dokumen dari aplikasi, mis. connimp_1699999999_123',
  table_name     VARCHAR(120) NOT NULL COMMENT 'tabel hasil, mis. dara_data_conn_pesanan',
  nama           VARCHAR(150) NULL,
  connection_id  VARCHAR(64)  NULL COMMENT 'FK logis ke dara_connections.id (tanpa constraint — koneksi sumber boleh dihapus, riwayat import tetap ada)',
  source_table   VARCHAR(255) NULL COMMENT 'nama tabel/koleksi ASLI di sisi database eksternal',
  total_rows     INT UNSIGNED NOT NULL DEFAULT 0,
  owner_nip      VARCHAR(30)  NULL COMMENT 'admin yang menjalankan import ini',
  shared_with    JSON         NULL,
  doc            JSON         NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_connimp_table (table_name),
  KEY idx_connimp_conn (connection_id),
  KEY idx_connimp_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Metadata tabel hasil import dari Data Connection (Fase 1)';
