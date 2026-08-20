-- =====================================================================
-- DARA FREE — 005_seed_accounts.sql
-- Akun pengguna awal (John Doe & Jane Doe).
--
-- KENAPA FILE TERPISAH dari 003_seed_core.sql?
--   004_seed_sample.sql men-TRUNCATE dara_data_pegawai untuk mengisi 40
--   pegawai contoh. Kalau akun pengguna diseed di 003 (sebelum 004), TRUNCATE
--   itu akan ikut menghapusnya. File ini sengaja diberi nomor SETELAH 004
--   supaya urutan filename (003, 004, 005) menjamin akun ini selalu ditulis
--   TERAKHIR, setelah tabel pegawai selesai diisi data contoh.
--
-- Idempotent: ON DUPLICATE KEY UPDATE, aman dijalankan ulang — tidak
-- men-TRUNCATE apa pun, jadi tidak akan menghapus pegawai lain yang sudah
-- ditambahkan admin lewat aplikasi.
--
-- KREDENSIAL BAWAAN
--   John Doe — nip 000000001, email john@example.com, role admin
--     password: admin123
--   Jane Doe — nip 000000002, email jane@example.com, role editor (user)
--     password: belum disetel — pakai menu Pengguna atau create-admin.mjs
--   >>> WAJIB ganti password John Doe setelah instalasi:
--       cd server && npm run create-admin
-- =====================================================================

INSERT INTO dara_data_pegawai (nip, nama, email, password_hash, role_kode, status, is_user, doc) VALUES
  ('000000001', 'John Doe', 'john@example.com',
   '$2a$10$fDzvUTGpAc6cUGD8XlpLUuexbiiWHsAGgYBKsS5RBsBkFwNGOzJxa', 'admin', 'AKTIF', 1,
   JSON_OBJECT('nip','000000001','nama','John Doe','email','john@example.com','role','admin',
               'createdAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z'))),
  ('000000002', 'Jane Doe', 'jane@example.com', NULL, 'editor', 'AKTIF', 1,
   JSON_OBJECT('nip','000000002','nama','Jane Doe','email','jane@example.com','role','user',
               'createdAt', DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')))
ON DUPLICATE KEY UPDATE
  nama = VALUES(nama), role_kode = VALUES(role_kode), is_user = 1;
