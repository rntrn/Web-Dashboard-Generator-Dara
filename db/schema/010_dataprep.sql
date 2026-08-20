-- =====================================================================
-- DARA FREE — 010_dataprep.sql
-- Fitur "Data Preparation" Fase 2: recipe engine. Tabel INI menyimpan
-- METADATA tabel hasil olah data (pilih kolom, ganti nama/tipe, JOIN) —
-- BUKAN data itu sendiri. Hasilnya disimpan sebagai tabel BARU terpisah
-- `dara_data_prep_*` (dibuat dinamis via CREATE TABLE ... AS SELECT oleh
-- server/src/modules/dataprep/dataprep.service.js).
--
-- Mengikuti pola "dokumen + proyeksi" yang sama seperti
-- 001_core.sql/008_connections.sql/009_conn_imports.sql.
-- =====================================================================

CREATE TABLE IF NOT EXISTS dara_dataprep (
  id             VARCHAR(64)  NOT NULL COMMENT 'id dokumen dari aplikasi, mis. prep_1699999999_123',
  table_name     VARCHAR(120) NOT NULL COMMENT 'tabel hasil, mis. dara_data_prep_gabungan',
  nama           VARCHAR(150) NULL,
  source_table   VARCHAR(120) NULL COMMENT 'tabel dara_data_* asal',
  join_table     VARCHAR(120) NULL COMMENT 'tabel kedua bila recipe pakai JOIN (NULL bila tidak)',
  total_rows     INT UNSIGNED NOT NULL DEFAULT 0,
  owner_nip      VARCHAR(30)  NULL COMMENT 'admin yang menjalankan Data Preparation ini',
  shared_with    JSON         NULL,
  doc            JSON         NOT NULL COMMENT 'termasuk recipe utuh (doc.recipe) untuk transparansi/audit',
  created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_dataprep_table (table_name),
  KEY idx_dataprep_source (source_table),
  KEY idx_dataprep_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Metadata tabel hasil Data Preparation (Fase 2)';
