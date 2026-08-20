-- =====================================================================
-- DARA FREE — 007_seed_provinsi.sql
-- Data contoh untuk dara_data_provinsi (layer AREA/choropleth peta).
--
-- 10 provinsi ini SENGAJA sama persis dengan yang muncul di kolom
-- `provinsi` pada dara_data_lokasi (004_seed_sample.sql) — supaya di menu
-- Peta, layer area (choropleth provinsi) dan layer titik (kantor/gudang/
-- outlet) saling melengkapi dan masuk akal ditampilkan bersamaan.
--
-- Poligon `geojson` adalah PERSEGI PANJANG yang disederhanakan (bounding
-- box kasar), BUKAN batas administratif hasil survei — lihat catatan di
-- db/schema/006_data_provinsi.sql. `populasi_juta` dan `luas_km2` adalah
-- ANGKA PERKIRAAN untuk keperluan demo (chart/choropleth), bukan data BPS
-- resmi — jangan dikutip sebagai sumber statistik.
--
-- Ditulis manual (bukan lewat db/tools/generate-sample.mjs seperti
-- 004_seed_sample.sql) karena datanya tetap/faktual (nama & letak kasar
-- provinsi), bukan sesuatu yang wajar diacak.
--
-- Aman diulang: tabel di-TRUNCATE lebih dulu.
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE dara_data_provinsi;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO dara_data_provinsi (id, kode, nama, pulau, ibu_kota, populasi_juta, luas_km2, geojson) VALUES
  (1, '31', 'DKI Jakarta', 'Jawa', 'Jakarta Pusat', 10.60, 664,
    '{"type":"Polygon","coordinates":[[[106.68,-6.37],[106.97,-6.37],[106.97,-6.05],[106.68,-6.05],[106.68,-6.37]]]}'),
  (2, '32', 'Jawa Barat', 'Jawa', 'Bandung', 48.80, 35377,
    '{"type":"Polygon","coordinates":[[[106.35,-7.83],[108.85,-7.83],[108.85,-5.90],[106.35,-5.90],[106.35,-7.83]]]}'),
  (3, '33', 'Jawa Tengah', 'Jawa', 'Semarang', 36.52, 32801,
    '{"type":"Polygon","coordinates":[[[108.55,-8.20],[111.50,-8.20],[111.50,-5.90],[108.55,-5.90],[108.55,-8.20]]]}'),
  (4, '34', 'DI Yogyakarta', 'Jawa', 'Yogyakarta', 3.70, 3133,
    '{"type":"Polygon","coordinates":[[[110.00,-8.22],[110.83,-8.22],[110.83,-7.55],[110.00,-7.55],[110.00,-8.22]]]}'),
  (5, '35', 'Jawa Timur', 'Jawa', 'Surabaya', 41.15, 47800,
    '{"type":"Polygon","coordinates":[[[111.00,-8.80],[114.45,-8.80],[114.45,-6.75],[111.00,-6.75],[111.00,-8.80]]]}'),
  (6, '12', 'Sumatera Utara', 'Sumatera', 'Medan', 15.20, 72981,
    '{"type":"Polygon","coordinates":[[[96.90,-0.50],[100.00,-0.50],[100.00,4.25],[96.90,4.25],[96.90,-0.50]]]}'),
  (7, '16', 'Sumatera Selatan', 'Sumatera', 'Palembang', 8.50, 91592,
    '{"type":"Polygon","coordinates":[[[102.50,-4.60],[106.00,-4.60],[106.00,-1.10],[102.50,-1.10],[102.50,-4.60]]]}'),
  (8, '73', 'Sulawesi Selatan', 'Sulawesi', 'Makassar', 9.15, 46717,
    '{"type":"Polygon","coordinates":[[[118.50,-7.50],[121.60,-7.50],[121.60,-1.90],[118.50,-1.90],[118.50,-7.50]]]}'),
  (9, '51', 'Bali', 'Bali', 'Denpasar', 4.32, 5780,
    '{"type":"Polygon","coordinates":[[[114.43,-8.90],[115.71,-8.90],[115.71,-8.05],[114.43,-8.05],[114.43,-8.90]]]}'),
  (10, '64', 'Kalimantan Timur', 'Kalimantan', 'Samarinda', 3.80, 127346,
    '{"type":"Polygon","coordinates":[[[113.50,-2.60],[119.50,-2.60],[119.50,2.50],[113.50,2.50],[113.50,-2.60]]]}');
