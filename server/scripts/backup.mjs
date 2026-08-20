/**
 * backup.mjs — cadangkan METADATA DARA (chart, dashboard, story, pengguna,
 * pengaturan, log) jadi satu berkas .zip berstempel-waktu di server/backups/.
 *
 * Jalankan:  npm run backup      (dari folder server/)
 * Otomatisasi: jadwalkan lewat Task Scheduler (Windows) atau cron (Linux).
 *
 * Yang DICADANGKAN  : isi tabel dara_* (metadata milik DARA), PLUS baris akun
 *                     (is_user=1) dari dara_data_pegawai sebagai users.json —
 *                     lihat catatan di bawah.
 * Yang TIDAK        : tabel dara_data_* selain baris akun di atas (data HR
 *                     dan sumber data Anda sendiri) — untuk itu pakai
 *                     mysqldump, lihat docs/05-backup-restore.md.
 *
 * CATATAN users.json: sejak pengguna aplikasi hidup di dara_data_pegawai
 * (bukan tabel dara_users terpisah — lihat db/schema/001_core.sql bagian 3),
 * backup ini menyalin HANYA baris dengan is_user=1 (akun), bukan seluruh
 * tabel pegawai (yang bisa berisi ratusan baris HR tak terkait akun).
 *
 * Format keluaran: satu berkas .json per koleksi di dalam zip, isinya sama
 * dengan mode META_STORE=file. Jadi hasil backup bisa dipakai untuk pindah
 * antar mode penyimpanan maupun antar server.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { zipSync } from "../src/lib/zip.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const OUT_DIR = path.resolve(__dirname, "../backups");
const KEEP = 30; // simpan N backup terbaru

/**
 * Koleksi → tabel. Selaras dengan PROJECTORS di src/config/metaStore.js.
 * TIDAK ADA "users" di sini — pengguna dicadangkan terpisah (lihat
 * collectUsers()) karena hidup di dara_data_pegawai, bukan tabel metadata.
 */
const TABLES = {
  charts: "dara_charts",
  dashboards: "dara_dashboards",
  stories: "dara_stories",
  uploads: "dara_uploads",
  activity: "dara_activity",
  settings: "dara_settings",
};

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Ambil metadata dari MySQL sebagai daftar { name, data }. */
async function collectFromMysql() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "dara_free",
  });
  try {
    const files = [];
    for (const [collection, table] of Object.entries(TABLES)) {
      const [rows] = await conn.query(`SELECT doc FROM \`${table}\``);
      const docs = rows.map((r) => (typeof r.doc === "string" ? JSON.parse(r.doc) : r.doc));
      files.push({
        name: `${collection}.json`,
        data: Buffer.from(JSON.stringify(docs, null, 2), "utf-8"),
      });
    }
    // Relasi antar tabel data disimpan sebagai tabel biasa (bukan doc).
    const [rel] = await conn.query(
      `SELECT from_table, from_column, to_table, to_column, join_type, catatan
       FROM dara_relations`
    );
    files.push({ name: "relations.json", data: Buffer.from(JSON.stringify(rel, null, 2), "utf-8") });

    const [cfg] = await conn.query(`SELECT scope, config_key, value FROM dara_appconfig`);
    files.push({ name: "appconfig.json", data: Buffer.from(JSON.stringify(cfg, null, 2), "utf-8") });

    // Akun pengguna (is_user=1) dari dara_data_pegawai — BUKAN seluruh
    // tabel pegawai. Termasuk password_hash: ini backup lengkap untuk
    // pemulihan, bukan API data yang dibatasi ke browser Jelajah Data.
    const [users] = await conn.query(
      `SELECT nip, nama, email, password_hash, role_kode, status,
              last_login_at, created_at, updated_at
       FROM dara_data_pegawai WHERE is_user = 1`
    );
    files.push({ name: "users.json", data: Buffer.from(JSON.stringify(users, null, 2), "utf-8") });

    return files;
  } finally {
    await conn.end();
  }
}

/** Mode META_STORE=file: cadangkan berkas JSON apa adanya. */
function collectFromFiles() {
  if (!fs.existsSync(DATA_DIR)) return [];
  return fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, data: fs.readFileSync(path.join(DATA_DIR, f)) }));
}

async function main() {
  const mode = (process.env.META_STORE || "mysql").toLowerCase();
  const files = mode === "mysql" ? await collectFromMysql() : collectFromFiles();

  if (files.length === 0) {
    console.log("[backup] Tidak ada metadata untuk dicadangkan.");
    return;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `dara-metadata-${stamp()}.zip`);
  fs.writeFileSync(outFile, zipSync(files));
  console.log(`[backup] ✓ ${files.length} koleksi (${mode}) -> ${outFile} (${fs.statSync(outFile).size} byte)`);

  // Rotasi: simpan KEEP terbaru.
  const backups = fs.readdirSync(OUT_DIR)
    .filter((f) => f.startsWith("dara-metadata-") && f.endsWith(".zip"))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - KEEP))) {
    try { fs.unlinkSync(path.join(OUT_DIR, old)); } catch { /* abaikan */ }
  }
}

main().catch((err) => {
  console.error("[backup] ✗ Gagal:", err.message);
  process.exit(1);
});
