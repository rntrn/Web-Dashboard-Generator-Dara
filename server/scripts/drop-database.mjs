/**
 * drop-database.mjs — hapus total database DARA Free (irreversible).
 *
 * Jalankan lewat scripts/uninstall.mjs di folder induk — SELALU didahului
 * backup otomatis di sana. Jangan panggil berkas ini langsung kecuali Anda
 * tahu persis apa yang dilakukan.
 *
 *   MySQL  : DROP DATABASE <MYSQL_DATABASE>
 *   SQLite : hapus berkas <DB_PATH> (bawaan ./dara.db, relatif ke server/)
 *
 * Keluar dengan kode 0 bila berhasil (atau memang sudah tidak ada apa-apa
 * untuk dihapus), kode 1 bila gagal.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";

const DB_TYPE = (process.env.DB_TYPE || "mysql").toLowerCase();

async function hapusMysql() {
  const nama = process.env.MYSQL_DATABASE || "dara_free";

  // Pengaman: nama database dipakai langsung dalam pernyataan DDL (DROP
  // DATABASE tidak bisa memakai parameter terikat seperti nilai biasa).
  // Nama yang tidak sesuai pola ini ditolak alih-alih dikirim apa adanya.
  if (!/^[A-Za-z0-9_]+$/.test(nama)) {
    throw new Error(`Nama database "${nama}" mengandung karakter yang tidak diizinkan — dibatalkan.`);
  }

  const mysql = (await import("mysql2/promise")).default;
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    // Sengaja TIDAK menyetel `database` — kita akan menghapusnya, jadi
    // jangan sampai koneksi gagal gara-gara database itu sendiri.
  });

  try {
    const [rows] = await conn.query(
      "SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?",
      [nama]
    );
    if (!rows.length) {
      console.log(`  · database "${nama}" tidak ditemukan — tidak ada yang dihapus`);
      return;
    }
    await conn.query(`DROP DATABASE \`${nama}\``);
    console.log(`  ✓ database "${nama}" dihapus`);
  } finally {
    await conn.end();
  }
}

function hapusSqlite() {
  const rel = process.env.DB_PATH || "./dara.db";
  const file = path.resolve(process.cwd(), rel);
  let dihapus = 0;
  for (const f of [file, `${file}-journal`, `${file}-wal`, `${file}-shm`]) {
    if (fs.existsSync(f)) {
      fs.rmSync(f);
      dihapus++;
    }
  }
  console.log(
    dihapus
      ? `  ✓ berkas SQLite dihapus (${file})`
      : `  · berkas SQLite tidak ditemukan (${file}) — tidak ada yang dihapus`
  );
}

async function main() {
  console.log(`\nMenghapus database (DB_TYPE=${DB_TYPE})...`);
  if (DB_TYPE === "sqlite") {
    hapusSqlite();
  } else {
    await hapusMysql();
  }
}

main().catch((err) => {
  console.error(`  ✗ Gagal: ${err.message}`);
  process.exit(1);
});
