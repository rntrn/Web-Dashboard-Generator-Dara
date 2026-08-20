/**
 * create-admin.mjs — setel username & password admin lokal DARA Free.
 *
 * Jalankan: npm run create-admin   (dari folder server/)
 *
 * Script ini menulis langsung ke tabel dara_settings — baik kolom proyeksi
 * (admin_user, admin_hash) maupun kolom `doc` yang dibaca aplikasi, supaya
 * keduanya tidak berbeda isi.
 */

import "dotenv/config";
import readline from "readline";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

/** Baca password tanpa menampilkannya di layar. */
function askHidden(q) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(q);
    const onData = (char) => {
      const s = char.toString();
      if (s === "\n" || s === "\r" || s === "") {
        stdin.removeListener("data", onData);
        return;
      }
      // tulis ulang baris tanpa memperlihatkan karakter
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      process.stdout.write(q + "*".repeat(rl.line.length));
    };
    stdin.on("data", onData);
    rl.question("", (val) => {
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(val);
    });
  });
}

async function main() {
  const username = (await ask("Username admin [admin]: ")).trim() || "admin";
  const password = (await askHidden("Password baru (min 8 karakter): ")).trim();
  const confirm = (await askHidden("Ulangi password             : ")).trim();
  rl.close();

  if (password.length < 8) throw new Error("Password minimal 8 karakter.");
  if (password !== confirm) throw new Error("Password tidak sama.");

  const hash = bcrypt.hashSync(password, 10);
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "dara_free",
  });

  try {
    const [rows] = await conn.query("SELECT doc FROM dara_settings WHERE id = 1");
    const doc = rows.length
      ? (typeof rows[0].doc === "string" ? JSON.parse(rows[0].doc) : rows[0].doc)
      : { devMode: false, aclEnabled: true, uploadEnabled: true, createdAt: new Date().toISOString() };

    doc.adminUser = username;
    doc.adminHash = hash;
    doc.updatedAt = new Date().toISOString();

    await conn.query(
      `INSERT INTO dara_settings (id, admin_user, admin_hash, doc)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE admin_user = VALUES(admin_user),
                               admin_hash = VALUES(admin_hash),
                               doc        = VALUES(doc)`,
      [username, hash, JSON.stringify(doc)]
    );
    console.log(`\n✓ Admin "${username}" berhasil disetel.`);
    console.log("  Restart server bila sedang berjalan (metadata dimuat saat boot).");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("\n✗ Gagal:", err.message);
  process.exit(1);
});
