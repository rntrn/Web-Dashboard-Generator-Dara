#!/usr/bin/env node
/**
 * =====================================================================
 * DARA FREE — Uninstall (hapus database + bersihkan instalasi lokal)
 * =====================================================================
 *
 *     npm run uninstall                 (dari folder induk proyek)
 *     uninstall.bat                     (Windows, klik dua kali)
 *     ./uninstall.sh                    (Linux/macOS)
 *
 * Urutan langkah, TIDAK bisa dilewati atau diubah urutannya:
 *
 *   1. Konfirmasi — ketik ulang nama database untuk melanjutkan
 *   2. BACKUP WAJIB — kode + database + metadata + .env, lewat
 *      scripts/backup-local.mjs. Kalau langkah ini gagal, uninstall
 *      DIBATALKAN SELURUHNYA — tidak ada opsi --skip-backup.
 *   3. Hapus database (MySQL: DROP DATABASE. SQLite: hapus berkas .db)
 *   4. Bersihkan folder hasil instalasi:
 *        server/node_modules, client/node_modules, client/dist,
 *        client/.vite, server/.env, client/.env, server/backups/,
 *        server/data/
 *
 * Yang TIDAK disentuh: kode sumber (.js/.jsx/.md/dst), riwayat git,
 * dan folder backup yang baru saja dibuat di langkah 2 (di LUAR proyek,
 * jadi selalu aman).
 *
 * Opsi:
 *   --yes    lewati prompt "ketik nama database" (backup TETAP wajib jalan)
 *
 * Setelah uninstall, pasang ulang dengan `npm run setup` (lihat
 * INSTALL.md), atau pulihkan dari backup — lihat INFO.txt di folder
 * backup yang disebutkan di ringkasan akhir.
 */

import fs from "fs";
import path from "path";
import readline from "readline";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "server");
const CLIENT = path.join(ROOT, "client");
const BACKUP_INDUK = path.join(ROOT, "..", "_backup-dara-free");

const argv = process.argv.slice(2);
const LEWATI_PROMPT = argv.includes("--yes");

// ---------------------------------------------------------------------
// Tampilan
// ---------------------------------------------------------------------
const warna = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (kode) => (s) => (warna ? `\x1b[${kode}m${s}\x1b[0m` : String(s));
const hijau = c("32"), kuning = c("33"), merah = c("31"), redup = c("90"), tebal = c("1");

const ok = (s) => console.log(`  ${hijau("✓")} ${s}`);
const lewat = (s) => console.log(`  ${kuning("·")} ${s}`);
const gagal = (s) => console.log(`  ${merah("✗")} ${s}`);
const judul = (s) => console.log(`\n${tebal(s)}\n${redup("─".repeat(60))}`);

function batalkan(pesan) {
  console.log(`\n${merah("✗ Uninstall dibatalkan.")} ${pesan}\n`);
  process.exit(1);
}

/** Baca .env jadi objek. {} bila berkas tidak ada. */
function bacaEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const baris of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i !== -1) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

/** Jalankan perintah dengan output langsung terlihat (backup/drop-database
 *  butuh ini supaya progresnya kelihatan, bukan cuma "sedang bekerja..."). */
function jalankanTampil(cmd, args, opt = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opt });
  return r.status === 0;
}

function hapusFolder(p, label) {
  if (!fs.existsSync(p)) {
    lewat(`${label} — tidak ada`);
    return;
  }
  fs.rmSync(p, { recursive: true, force: true });
  ok(`${label} dihapus`);
}

function hapusBerkas(p, label) {
  if (!fs.existsSync(p)) {
    lewat(`${label} — tidak ada`);
    return;
  }
  fs.rmSync(p);
  ok(`${label} dihapus`);
}

function backupTerbaru() {
  if (!fs.existsSync(BACKUP_INDUK)) return null;
  const semua = fs.readdirSync(BACKUP_INDUK, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{8}-\d{6}$/.test(e.name))
    .map((e) => e.name)
    .sort();
  return semua.length ? path.join(BACKUP_INDUK, semua[semua.length - 1]) : null;
}

// ---------------------------------------------------------------------
// Alur utama
// ---------------------------------------------------------------------
async function main() {
  const env = bacaEnv(path.join(SERVER, ".env"));
  const dbType = (env.DB_TYPE || "mysql").toLowerCase();
  const namaDb = dbType === "sqlite" ? (env.DB_PATH || "./dara.db") : (env.MYSQL_DATABASE || "dara_free");

  console.log(`
${tebal("DARA FREE — Uninstall")}
${redup("─".repeat(60))}
${merah("Tindakan ini TIDAK BISA DIBATALKAN setelah database dihapus.")}

Yang akan terjadi, berurutan:
  1. Backup penuh WAJIB (kode + database + metadata + .env)
  2. Hapus database  : ${tebal(namaDb)}  ${redup(`(${dbType})`)}
  3. Hapus folder    : server/node_modules, client/node_modules,
                       client/dist, client/.vite, server/.env, client/.env,
                       server/backups/, server/data/

Yang TIDAK disentuh : kode sumber, riwayat git, folder backup di langkah 1
                       (ditulis di luar proyek: ${redup(BACKUP_INDUK)})
`);

  if (!LEWATI_PROMPT) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const jawab = await new Promise((res) =>
      rl.question(`Ketik nama database di atas ("${namaDb}") untuk melanjutkan, atau Enter untuk batal: `, res)
    );
    rl.close();
    if (jawab.trim() !== namaDb) {
      batalkan("Ketikan tidak cocok (atau dikosongkan) — tidak ada yang diubah.");
    }
  }

  // --- 1. Backup wajib --------------------------------------------------
  judul("[1/3] Backup penuh (wajib, tidak bisa dilewati)");
  const backupOk = jalankanTampil("node", ["scripts/backup-local.mjs"], { cwd: ROOT });
  if (!backupOk) {
    batalkan(
      "Backup gagal — lihat pesan di atas. Database TIDAK disentuh. " +
      "Perbaiki penyebabnya (mis. mysqldump tidak ada di PATH, atau server/.env salah) lalu coba lagi."
    );
  }
  const folderBackup = backupTerbaru();

  // backup-local.mjs sengaja tidak gagal (exit 0) kalau satu bagian saja
  // dilewati (mis. database.sql dilewati karena mysqldump tidak ada di
  // PATH, atau server/.env belum ada) — itu wajar untuk backup rutin,
  // tapi TIDAK boleh dianggap cukup di sini: kalau databasenya mau
  // dihapus, backup datanya harus benar-benar ada, bukan cuma "skrip
  // selesai tanpa error". Jadi diperiksa ulang secara eksplisit.
  if (dbType !== "sqlite") {
    const dumpFile = folderBackup ? path.join(folderBackup, "database.sql") : null;
    const dumpAda = dumpFile && fs.existsSync(dumpFile) && fs.statSync(dumpFile).size > 0;
    if (!dumpAda) {
      batalkan(
        "database.sql tidak ada / kosong di hasil backup — backup ini TIDAK cukup untuk " +
        "melanjutkan penghapusan database. Kemungkinan `mysqldump` tidak ada di PATH atau " +
        "server/.env belum berisi kredensial yang benar. Perbaiki lalu coba lagi. " +
        "Database TIDAK disentuh."
      );
    }
    ok(`database.sql terverifikasi ada isinya (${dumpFile})`);
  }

  // --- 2. Hapus database -------------------------------------------------
  judul("[2/3] Hapus database");
  const dbOk = jalankanTampil("node", ["scripts/drop-database.mjs"], { cwd: SERVER });
  if (!dbOk) {
    batalkan(
      "Gagal menghapus database — lihat pesan di atas. Backup di langkah 1 " +
      `sudah aman di ${folderBackup || BACKUP_INDUK}. Folder lokal TIDAK dihapus.`
    );
  }

  // --- 3. Bersihkan folder instalasi -------------------------------------
  judul("[3/3] Bersihkan folder hasil instalasi");
  hapusFolder(path.join(SERVER, "node_modules"), "server/node_modules");
  hapusFolder(path.join(CLIENT, "node_modules"), "client/node_modules");
  hapusFolder(path.join(CLIENT, "dist"), "client/dist");
  hapusFolder(path.join(CLIENT, ".vite"), "client/.vite");
  hapusFolder(path.join(SERVER, "backups"), "server/backups/");
  hapusFolder(path.join(SERVER, "data"), "server/data/");
  hapusBerkas(path.join(SERVER, ".env"), "server/.env");
  hapusBerkas(path.join(CLIENT, ".env"), "client/.env");

  console.log(`
${hijau("✓ Uninstall selesai.")}

  Backup tersimpan di :  ${folderBackup || "(tidak ditemukan — periksa " + BACKUP_INDUK + ")"}
  Cara memulihkan      :  lihat INFO.txt di folder backup itu

  Pasang ulang         :  npm run setup     (lihat INSTALL.md)
`);
}

main().catch((err) => {
  gagal(err.message);
  process.exit(1);
});
