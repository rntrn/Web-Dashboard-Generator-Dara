-- =====================================================================
-- DARA FREE — 006_data_provinsi.sql
-- Tabel contoh KEDUA untuk fitur peta: layer AREA (choropleth per
-- provinsi), melengkapi dara_data_lokasi yang cuma layer titik (marker).
--
-- KENAPA TABEL BARU, BUKAN NAMBAH KOLOM DI dara_data_lokasi:
-- Komentar lama di 002_sample_tables.sql mengklaim kolom `provinsi` di
-- dara_data_lokasi "dipakai untuk layer area (choropleth)" — itu SALAH.
-- server/src/modules/geo/geo.service.js hanya mengenali layer area lewat
-- kolom yang namanya berakhiran geojson/geometry/geom/boundary/wkt berisi
-- geometri GeoJSON per baris; kolom teks biasa seperti `provinsi` tidak
-- pernah terdeteksi. Jadi sebelum tabel ini ada, menu Peta di edisi contoh
-- HANYA punya layer titik — tidak ada layer area yang benar-benar bisa
-- ditampilkan. Lihat juga db/README.md.
-- =====================================================================

CREATE TABLE IF NOT EXISTS dara_data_provinsi (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  kode           CHAR(2)       NOT NULL COMMENT 'kode provinsi 2 digit (BPS, bukan wajib akurat untuk demo)',
  nama           VARCHAR(60)   NOT NULL,
  pulau          VARCHAR(30)   NOT NULL,
  ibu_kota       VARCHAR(60)   NOT NULL,
  populasi_juta  DECIMAL(6,2)  NOT NULL COMMENT 'perkiraan, untuk demo — bukan angka BPS resmi',
  luas_km2       INT UNSIGNED  NOT NULL COMMENT 'perkiraan, untuk demo — bukan angka BPS resmi',
  geojson        LONGTEXT      NOT NULL COMMENT
    'Polygon GeoJSON (bukan Feature, cuma objek geometry) — SENGAJA
     disederhanakan jadi persegi panjang yang membungkus wilayah provinsi
     secara kasar, BUKAN batas administratif hasil survei. Cukup untuk
     mendemonstrasikan layer area/choropleth; ganti dengan data batas
     wilayah resmi (mis. dari Kemendagri/BIG) untuk pemakaian produksi.',
  PRIMARY KEY (id),
  UNIQUE KEY uq_provinsi_kode (kode),
  UNIQUE KEY uq_provinsi_nama (nama)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Contoh tabel layer AREA untuk peta (choropleth) — lihat catatan geojson di atas';
