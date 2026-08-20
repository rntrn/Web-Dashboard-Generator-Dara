/**
 * Entry point DARA FREE — jalankan dengan: npm run dev  (atau npm start)
 *
 * URUTAN BOOT (penting, jangan diacak):
 *   1. muat .env
 *   2. metaStore.init()  → tarik seluruh metadata dari MySQL ke memori.
 *      HARUS selesai sebelum modul lain membacanya secara sinkron.
 *   3. import app.js     → baru di sini rute & service dimuat.
 *   4. ensureLocalAdmin() → buat admin bawaan bila database masih kosong.
 *   5. listen
 *
 * Karena langkah 2 harus mendahului langkah 3, `app.js` diimpor secara dinamis
 * (await import), bukan lewat import statis di atas berkas.
 */
import "dotenv/config";
import { metaStore } from "./config/metaStore.js";
import Database from "./config/database.js";

const PORT = process.env.PORT || 3001;

async function main() {
  // 1) Cek koneksi database lebih dulu supaya pesan errornya jelas,
  //    bukan tumpukan stack trace dari modul yang jauh di dalam.
  const db = new Database();
  try {
    await db.init();
    await db.query("SELECT 1");
  } catch (err) {
    console.error("✗ Tidak bisa terhubung ke database.");
    console.error("  Pesan:", err.message);
    console.error("  Periksa server/.env (MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE)");
    console.error("  atau jalankan ulang installer: npm run setup");
    process.exit(1);
  }

  // 2) Muat metadata ke memori.
  await metaStore.init();

  // 3) Baru muat aplikasi Express.
  const { default: app } = await import("./app.js");
  const { ensureLocalAdmin } = await import("./modules/users/users.service.js");

  // 4) Admin bawaan (hanya dibuat bila belum ada).
  ensureLocalAdmin();

  // 5) Terima permintaan.
  const server = app.listen(PORT, () => {
    console.log(`✓ DARA Free — Web Dashboard Generator`);
    console.log(`  idea     : rntrn`);
    console.log(`  server   : http://localhost:${PORT}`);
    console.log(`  database : ${db.dbType}`);
    console.log(`  metadata : ${metaStore.mode}`);
  });

  async function shutdown(signal) {
    console.log(`\n${signal} diterima — menutup server...`);
    server.close();
    // Pastikan penulisan metadata yang masih tertunda selesai dulu,
    // supaya perubahan terakhir tidak hilang.
    await metaStore.flush();
    await db.close();
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("✗ Gagal menjalankan server:", err);
  process.exit(1);
});
