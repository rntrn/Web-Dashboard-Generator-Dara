/**
 * migrate.mjs — penerap migrasi SQL untuk DARA Free.
 *
 * Cara kerja (sengaja sederhana, tanpa pustaka migrasi eksternal):
 *   1. baca semua berkas .sql di db/schema/ lalu db/seed/, urut nama berkas
 *   2. lewati berkas yang versinya sudah tercatat di dara_schema_migrations
 *   3. jalankan berkas yang belum, lalu catat versinya
 *
 * "Versi" = angka di awal nama berkas, mis. 001 dari "001_core.sql".
 *
 * Pemakaian:
 *   node scripts/migrate.mjs                  # skema + seed inti
 *   node scripts/migrate.mjs --with-sample    # + data contoh dara_data_*
 *   node scripts/migrate.mjs --reset          # DROP semua tabel dara_* dulu
 *   node scripts/migrate.mjs --status         # tampilkan migrasi yang sudah jalan
 *
 * Semua berkas SQL bersifat idempotent (CREATE TABLE IF NOT EXISTS,
 * INSERT ... ON DUPLICATE KEY UPDATE), jadi menjalankan ulang tidak merusak —
 * SELAMA isi berkasnya tidak berubah sejak terakhir diterapkan.
 *
 * PENTING — deteksi skema usang (checksum drift):
 * "Sudah diterapkan" ditentukan dari NOMOR VERSI saja (mis. "002"), bukan
 * dari isi berkasnya. Kalau database ini dipasangi versi LAMA proyek (mis.
 * hasil clone lama, atau sebelum sebuah tabel di-redesain), lalu proyeknya
 * diperbarui sehingga isi 002_sample_tables.sql berubah — versi "002" di
 * database tetap dianggap "sudah jalan" dan DILEWATI, padahal struktur
 * tabelnya sudah tidak cocok lagi dengan skema yang sekarang. Migrasi
 * berikutnya (mis. seed akun) lalu gagal dengan pesan MySQL yang membingungkan
 * seperti "Unknown column 'email' in 'field list'".
 *
 * Untuk mencegah ini, setiap migrasi yang dilewati diperiksa checksum-nya.
 * Kalau tidak cocok dengan yang tercatat, skrip BERHENTI dengan pesan jelas
 * sebelum sempat menjalankan migrasi berikutnya yang bergantung padanya —
 * lihat cekChecksumDrift() di bawah. Solusinya: `--reset` (hapus semua tabel
 * dara_* lalu pasang ulang dari nol), yang juga bisa dipicu lewat installer
 * dengan `node installer/index.js --reset-db`.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, "../../db");

const args = process.argv.slice(2);
const withSample = args.includes("--with-sample");
const doReset = args.includes("--reset");
const statusOnly = args.includes("--status");

const cfg = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "dara_free",
  multipleStatements: true, // berkas .sql berisi banyak perintah
  charset: "utf8mb4_unicode_ci",
};

// Nomor versi yang berisi baris DATA CONTOH (bukan struktur tabel) —
// hanya ini yang dilewati tanpa --with-sample. SENGAJA daftar eksplisit,
// BUKAN regex /sample/i.test(nama berkas): nama seperti
// "002_sample_tables.sql" (skema, CREATE TABLE dara_data_*) juga
// mengandung kata "sample", jadi kalau dipakai sebagai penanda akan ikut
// terlewat — dan tabelnya sendiri jadi tidak pernah dibuat, membuat
// 005_seed_accounts.sql gagal (INSERT ke tabel yang tidak ada) pada
// instalasi tanpa data contoh.
const VERSI_DATA_CONTOH = new Set(["004", "007"]);

/** Berkas migrasi: { version, name, file, isSample }. */
function collectFiles() {
  const out = [];
  for (const sub of ["schema", "seed"]) {
    const dir = path.join(DB_DIR, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      out.push({
        version: f.split("_")[0],
        name: f,
        file: path.join(dir, f),
        // Data contoh (baris ilustratif) hanya dijalankan bila diminta
        // eksplisit lewat --with-sample. Tabel STRUKTUR selalu dibuat.
        isSample: VERSI_DATA_CONTOH.has(f.split("_")[0]),
      });
    }
  }
  return out.sort((a, b) => a.version.localeCompare(b.version));
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

async function ensureMigrationTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS dara_schema_migrations (
      version    VARCHAR(20)  NOT NULL,
      name       VARCHAR(120) NOT NULL,
      checksum   CHAR(64)     NULL,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

/**
 * Bandingkan checksum berkas migrasi yang akan DILEWATI (karena versinya
 * sudah tercatat) dengan checksum yang tersimpan saat pertama diterapkan.
 * Lihat catatan "deteksi skema usang" di kepala berkas ini.
 * @returns {{version: string, name: string}[]} daftar migrasi yang driftnya
 *   terdeteksi (kosong = aman)
 */
function cekChecksumDrift(files, appliedMap) {
  const drift = [];
  for (const f of files) {
    const tercatat = appliedMap.get(f.version);
    if (!tercatat || !tercatat.checksum) continue; // belum pernah jalan, atau checksum lama (pra-fitur ini) — lewati
    const isiSekarang = sha256(fs.readFileSync(f.file, "utf-8"));
    if (isiSekarang !== tercatat.checksum) {
      drift.push({ version: f.version, name: f.name, namaTercatat: tercatat.name });
    }
  }
  return drift;
}

/** Hapus SEMUA tabel berawalan dara_ (dipakai --reset). */
async function reset(conn) {
  const [rows] = await conn.query(
    `SELECT table_name AS n FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name LIKE 'dara\\_%'`
  );
  if (rows.length === 0) {
    console.log("  (tidak ada tabel dara_* untuk dihapus)");
    return;
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const r of rows) {
    await conn.query(`DROP TABLE IF EXISTS \`${r.n}\``);
    console.log(`  - drop ${r.n}`);
  }
  await conn.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function main() {
  console.log(`→ Menghubungi MySQL ${cfg.user}@${cfg.host}:${cfg.port}/${cfg.database}`);
  const conn = await mysql.createConnection(cfg);

  try {
    if (doReset) {
      console.log("→ Reset: menghapus tabel dara_*");
      await reset(conn);
    }

    await ensureMigrationTable(conn);
    const [applied] = await conn.query("SELECT version, name, checksum, applied_at FROM dara_schema_migrations ORDER BY version");
    const doneSet = new Set(applied.map((r) => r.version));
    const appliedMap = new Map(applied.map((r) => [r.version, r]));

    if (!doReset && !statusOnly) {
      const drift = cekChecksumDrift(collectFiles(), appliedMap);
      if (drift.length > 0) {
        const daftar = drift.map((d) => `    - ${d.version}  ${d.name}`).join("\n");
        throw new Error(
          `Skema database ini SUDAH BERUBAH sejak terakhir diterapkan (${drift.length} berkas):\n${daftar}\n\n` +
          `  Ini biasanya berarti database "${cfg.database}" dipasangi versi LAMA proyek ini\n` +
          `  (mis. sebelum sebuah tabel di-redesain), lalu berkas skemanya diperbarui.\n` +
          `  Melanjutkan migrasi bisa gagal dengan galat MySQL yang membingungkan\n` +
          `  (kolom/tabel tidak ditemukan) karena strukturnya sudah tidak cocok.\n\n` +
          `  Solusi — instalasi bersih (menghapus semua tabel dara_* lalu memasang ulang\n` +
          `  dari nol; DATA HILANG, backup dulu bila perlu):\n` +
          `    node installer/index.js --reset-db        (dari folder induk proyek)\n` +
          `    atau langsung: node scripts/migrate.mjs --reset --with-sample`
        );
      }
    }

    if (statusOnly) {
      console.log("\nMigrasi yang sudah diterapkan:");
      if (applied.length === 0) console.log("  (belum ada)");
      for (const r of applied) console.log(`  ✓ ${r.version}  ${r.name}  (${r.applied_at})`);
      const pending = collectFiles().filter((f) => !doneSet.has(f.version));
      console.log("\nBelum dijalankan:");
      if (pending.length === 0) console.log("  (tidak ada)");
      for (const f of pending) console.log(`  · ${f.version}  ${f.name}${f.isSample ? "  [butuh --with-sample]" : ""}`);
      return;
    }

    let ran = 0;
    for (const m of collectFiles()) {
      if (m.isSample && !withSample) {
        console.log(`  · lewati ${m.name} (jalankan dengan --with-sample bila ingin data contoh)`);
        continue;
      }
      if (doneSet.has(m.version)) {
        console.log(`  · lewati ${m.name} (sudah diterapkan)`);
        continue;
      }
      const sql = fs.readFileSync(m.file, "utf-8");
      process.stdout.write(`  → jalankan ${m.name} ... `);
      await conn.query(sql);
      await conn.query(
        "INSERT INTO dara_schema_migrations (version, name, checksum) VALUES (?, ?, ?)",
        [m.version, m.name, sha256(sql)]
      );
      console.log("selesai");
      ran += 1;
    }

    console.log(ran === 0 ? "\n✓ Database sudah paling baru." : `\n✓ ${ran} migrasi diterapkan.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("\n✗ Migrasi gagal:", err.message);
  if (err.code === "ER_ACCESS_DENIED_ERROR")
    console.error("  Periksa MYSQL_USER / MYSQL_PASSWORD di server/.env");
  if (err.code === "ER_BAD_DB_ERROR")
    console.error(`  Database "${cfg.database}" belum ada. Buat dulu:\n` +
      `    CREATE DATABASE ${cfg.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  if (err.code === "ECONNREFUSED")
    console.error("  Server MySQL tidak berjalan atau host/port salah.");
  process.exit(1);
});
