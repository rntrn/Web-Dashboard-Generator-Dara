/**
 * db.js — pekerjaan installer yang berhubungan dengan MySQL.
 *
 * Catatan penting: modul ini memakai `mysql2`, yang baru tersedia SETELAH
 * `npm install` di folder server. Karena itu ia diimpor secara dinamis dari
 * node_modules server — bukan lewat import statis di atas berkas.
 */

import path from "path";
import { pathToFileURL } from "url";

/** Muat mysql2/promise dari node_modules milik server. */
async function muatMysql(rootServer) {
  const jalur = path.join(rootServer, "node_modules", "mysql2", "promise.js");
  try {
    return (await import(pathToFileURL(jalur).href)).default;
  } catch {
    // Cadangan: mungkin dipasang di root proyek atau global.
    return (await import("mysql2/promise")).default;
  }
}

/**
 * Uji koneksi ke server MySQL (tanpa memilih database).
 * @returns {{ok: boolean, pesan: string, versi?: string}}
 */
export async function ujiKoneksi(rootServer, cfg) {
  const mysql = await muatMysql(rootServer);
  let conn;
  try {
    conn = await mysql.createConnection({
      host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
      connectTimeout: 8000,
    });
    const [rows] = await conn.query("SELECT VERSION() AS v");
    return { ok: true, pesan: "koneksi berhasil", versi: rows[0].v };
  } catch (err) {
    return { ok: false, pesan: jelaskanGalat(err) };
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

/** Buat database bila belum ada (utf8mb4). */
export async function buatDatabase(rootServer, cfg) {
  const mysql = await muatMysql(rootServer);
  const conn = await mysql.createConnection({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
  });
  try {
    // Nama database tidak bisa jadi parameter terikat, jadi divalidasi ketat
    // dulu: hanya huruf, angka, dan garis bawah yang diizinkan.
    if (!/^[A-Za-z0-9_]+$/.test(cfg.database))
      throw new Error(`Nama database "${cfg.database}" tidak valid (hanya huruf, angka, _).`);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${cfg.database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    return true;
  } finally {
    await conn.end();
  }
}

/**
 * Cek apakah database ini sudah pernah dipasangi DARA sebelumnya — dipakai
 * installer untuk menawarkan pilihan "lanjutkan" vs "instalasi bersih"
 * alih-alih diam-diam mencoba migrasi di atas skema yang mungkin sudah
 * usang (lihat catatan checksum di server/scripts/migrate.mjs).
 * @returns {{adaInstalasiLama: boolean, jumlahMigrasi: number, jumlahTabel: number}}
 */
export async function cekInstalasiSebelumnya(rootServer, cfg) {
  const mysql = await muatMysql(rootServer);
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: false });
  try {
    const [tabel] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name LIKE 'dara\\_%'`
    );
    const jumlahTabel = Number(tabel[0].n);
    if (jumlahTabel === 0) return { adaInstalasiLama: false, jumlahMigrasi: 0, jumlahTabel: 0 };

    let jumlahMigrasi = 0;
    try {
      const [m] = await conn.query("SELECT COUNT(*) AS n FROM dara_schema_migrations");
      jumlahMigrasi = Number(m[0].n);
    } catch {
      // Ada tabel dara_* tapi belum ada dara_schema_migrations — tetap
      // dianggap "ada instalasi lama" (mis. dipasang manual lewat berkas .sql).
    }
    return { adaInstalasiLama: true, jumlahMigrasi, jumlahTabel };
  } finally {
    await conn.end();
  }
}

/** Ringkasan isi database setelah migrasi (untuk verifikasi akhir). */
export async function ringkasanIsi(rootServer, cfg) {
  const mysql = await muatMysql(rootServer);
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: false });
  try {
    const [tabel] = await conn.query(
      `SELECT table_name AS nama, table_rows AS perkiraan_baris
       FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name LIKE 'dara%'
       ORDER BY table_name`
    );
    // table_rows dari information_schema hanya perkiraan untuk InnoDB, jadi
    // tabel contoh dihitung ulang secara pasti.
    const pasti = {};
    for (const t of ["dara_data_penjualan", "dara_data_pegawai", "dara_data_unit", "dara_data_lokasi"]) {
      try {
        const [r] = await conn.query(`SELECT COUNT(*) AS n FROM \`${t}\``);
        pasti[t] = Number(r[0].n);
      } catch { /* tabel contoh mungkin tidak dipasang */ }
    }
    return { tabel, pasti };
  } finally {
    await conn.end();
  }
}

/** Ubah pesan galat mysql2 jadi kalimat yang bisa ditindaklanjuti. */
export function jelaskanGalat(err) {
  switch (err.code) {
    case "ECONNREFUSED":
      return "server MySQL tidak merespons. Pastikan MySQL sudah berjalan dan host/port benar.";
    case "ER_ACCESS_DENIED_ERROR":
      return "username atau password ditolak MySQL.";
    case "ER_BAD_DB_ERROR":
      return "database tidak ditemukan.";
    case "ENOTFOUND":
      return "nama host tidak dikenali.";
    case "ETIMEDOUT":
      return "koneksi habis waktu. Cek firewall atau alamat host.";
    default:
      return err.message;
  }
}

export default { ujiKoneksi, buatDatabase, cekInstalasiSebelumnya, ringkasanIsi, jelaskanGalat };
