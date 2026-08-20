-- =====================================================================
-- DARA FREE — 003_seed_core.sql
-- Data awal WAJIB: peran, pengaturan, admin, relasi contoh, konfigurasi.
--
-- Idempotent: memakai INSERT ... ON DUPLICATE KEY UPDATE, jadi aman
-- dijalankan ulang tanpa menghasilkan baris ganda.
--
-- KREDENSIAL BAWAAN — lihat db/seed/005_seed_accounts.sql
--   (John Doe / Jane Doe sengaja diseed di file TERPISAH yang jalan setelah
--    004_seed_sample.sql, karena file itu men-TRUNCATE dara_data_pegawai)
--   >>> WAJIB diganti setelah instalasi:  cd server && npm run create-admin
--
-- Catatan pola "dokumen + proyeksi" (lihat 001_core.sql): kolom `doc`
-- adalah sumber kebenaran yang dibaca aplikasi; kolom lain adalah salinan
-- untuk keperluan query SQL. Keduanya diisi bersamaan di bawah ini.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Peran bawaan
-- ---------------------------------------------------------------------
INSERT INTO dara_roles (kode, nama, deskripsi, permissions, is_system) VALUES
  ('admin',  'Administrator', 'Akses penuh termasuk pengaturan dan pengguna',
   JSON_ARRAY('*'), 1),
  ('editor', 'Editor',        'Boleh membuat dan mengubah chart, dashboard, dan story',
   JSON_ARRAY('chart:read','chart:write','dashboard:read','dashboard:write',
              'story:read','story:write','upload:write','data:read'), 1),
  ('viewer', 'Pembaca',       'Hanya boleh melihat chart dan dashboard yang dibagikan',
   JSON_ARRAY('chart:read','dashboard:read','story:read','data:read'), 1)
ON DUPLICATE KEY UPDATE
  nama = VALUES(nama), deskripsi = VALUES(deskripsi), permissions = VALUES(permissions);

-- ---------------------------------------------------------------------
-- Pengaturan global (satu baris, id = 1)
-- Hash di bawah adalah bcrypt dari "admin123".
-- ---------------------------------------------------------------------
INSERT INTO dara_settings
  (id, admin_user, admin_hash, app_name, dev_mode, acl_enabled, upload_enabled, doc)
VALUES
  (1, 'admin', '$2a$10$fDzvUTGpAc6cUGD8XlpLUuexbiiWHsAGgYBKsS5RBsBkFwNGOzJxa',
   'DARA Free', 0, 1, 1,
   JSON_OBJECT(
     'adminUser',     'admin',
     'adminHash',     '$2a$10$fDzvUTGpAc6cUGD8XlpLUuexbiiWHsAGgYBKsS5RBsBkFwNGOzJxa',
     'devMode',        FALSE,
     'aclEnabled',     TRUE,
     'uploadEnabled',  TRUE,
     'createdAt',      DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')
   ))
ON DUPLICATE KEY UPDATE
  app_name = VALUES(app_name);   -- password admin TIDAK ditimpa saat migrasi ulang

-- ---------------------------------------------------------------------
-- Relasi antar tabel data
-- dara_data_pegawai.unit_id → dara_data_unit.id
-- (sebenarnya terdeteksi otomatis lewat konvensi *_id; dicatat di sini
--  sebagai contoh isi tabel relasi manual)
-- ---------------------------------------------------------------------
INSERT INTO dara_relations
  (from_table, from_column, to_table, to_column, join_type, catatan)
VALUES
  ('dara_data_pegawai', 'unit_id', 'dara_data_unit', 'id', 'LEFT',
   'Contoh relasi bawaan hasil instalasi')
ON DUPLICATE KEY UPDATE catatan = VALUES(catatan);

-- ---------------------------------------------------------------------
-- Konfigurasi tampilan awal
-- ---------------------------------------------------------------------
INSERT INTO dara_appconfig (scope, config_key, value) VALUES
  ('brand', 'app_name',       JSON_QUOTE('DARA Free')),
  ('brand', 'tagline',        JSON_QUOTE('Buat dashboard langsung dari database')),
  ('theme', 'palette',        JSON_ARRAY('#2563eb','#16a34a','#f59e0b','#dc2626','#7c3aed','#0891b2')),
  ('theme', 'accent',         JSON_QUOTE('#2563eb')),
  ('i18n',  'default_locale', JSON_QUOTE('id')),
  ('geo',   'default_center', JSON_OBJECT('lat', -2.5, 'lon', 118.0, 'zoom', 5)),
  ('chart', 'max_rows',       CAST(50000 AS JSON))
ON DUPLICATE KEY UPDATE value = VALUES(value);
