#!/usr/bin/env node
/**
 * =====================================================================
 * DARA FREE — Installer
 * =====================================================================
 *
 * Jalankan dari folder induk proyek:
 *     npm run setup
 * atau langsung:
 *     node installer/index.js
 *
 * Yang dikerjakan, berurutan:
 *   1. periksa prasyarat (Node 18+, npm)
 *   2. tanya konfigurasi (MySQL, port, dsb)
 *   3. pasang dependensi server & client
 *   4. uji koneksi MySQL, buat database bila belum ada
 *   5. tulis server/.env dan client/.env
 *   6. jalankan migrasi skema + seed (opsional: data contoh)
 *   7. build client (opsional)
 *   8. verifikasi & tampilkan ringkasan
 *
 * Opsi baris perintah:
 *   --yes            pakai semua nilai bawaan, tanpa bertanya
 *   --skip-install   lewati npm install (dependensi sudah terpasang)
 *   --skip-build     lewati build client
 *   --no-sample      jangan pasang data contoh
 *   --reset-db       instalasi BERSIH: hapus semua tabel dara_* di database
 *                    tujuan dulu, baru pasang dari nol (DATA HILANG)
 *
 * Aman dijalankan ulang: .env lama dicadangkan (.env.bak), migrasi yang
 * sudah pernah jalan dilewati.
 *
 * Reinstall ke database yang SUDAH ADA isinya (mis. dari instalasi/versi
 * lama): installer mendeteksi ini di langkah 4 dan menawarkan pilihan
 * lanjutkan / instalasi bersih / batal (kecuali --yes atau --reset-db
 * dipakai). Ini juga jaring pengaman untuk kasus skema yang sudah berubah
 * sejak database itu dipasangi — lihat catatan "checksum drift" di
 * server/scripts/migrate.mjs.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath, pathToFileURL } from "url";

import { log, warna, tanya, tanyaRahasia, tanyaYaTidak, tanyaPilihan, tutupInput } from "./lib/ui.js";
import { periksaPrasyarat } from "./lib/prasyarat.js";
import { bacaEnv, tulisEnv } from "./lib/env.js";
import { ujiKoneksi, buatDatabase, cekInstalasiSebelumnya, ringkasanIsi } from "./lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER = path.join(ROOT, "server");
const CLIENT = path.join(ROOT, "client");

const argv = process.argv.slice(2);
const opsi = {
  otomatis: argv.includes("--yes"),
  lewatiInstall: argv.includes("--skip-install"),
  lewatiBuild: argv.includes("--skip-build"),
  tanpaContoh: argv.includes("--no-sample"),
  resetDb: argv.includes("--reset-db"),
};

const TOTAL_LANGKAH = 8;

/** Jalankan perintah dan tampilkan keluarannya langsung ke layar. */
function jalankan(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) {
    throw new Error(`Perintah gagal (kode ${r.status}): ${cmd} ${args.join(" ")}`);
  }
}

const rahasiaAcak = () => crypto.randomBytes(48).toString("hex");
// CONN_SECRET_KEY (enkripsi password koneksi Data Connection) WAJIB persis
// 32 byte (64 karakter hex) — lihat server/src/lib/secretCipher.js. BEDA
// dari rahasiaAcak() di atas (48 byte, untuk JWT_SECRET yang tidak punya
// batas panjang ketat) — jangan disamakan, kalau tertukar CONN_SECRET_KEY
// akan ditolak aplikasi ("harus 64 karakter heksadesimal").
const kunciEnkripsi32Byte = () => crypto.randomBytes(32).toString("hex");
const isHex64 = (v) => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v.trim());

// =====================================================================

async function main() {
  console.log(warna.judul(`
╔══════════════════════════════════════════════╗
║   DARA FREE — Web Dashboard Generator        ║
║   Installer                                  ║
╚══════════════════════════════════════════════╝`));
  console.log(warna.redup(`  Folder proyek: ${ROOT}`));
  if (opsi.otomatis) console.log(warna.redup("  Mode --yes: memakai nilai bawaan tanpa bertanya."));

  // ---- 1. Prasyarat --------------------------------------------------
  log.langkah(1, TOTAL_LANGKAH, "Memeriksa prasyarat");
  const { lolos, hasil } = periksaPrasyarat();
  for (const h of hasil) {
    const tanda = h.status ? log.ok : (h.wajib ? log.galat : log.peringatan);
    tanda(`${h.nama.padEnd(24)} ${h.pesan}`);
  }
  if (!lolos) {
    log.kosong();
    log.galat("Prasyarat wajib belum terpenuhi. Perbaiki dulu lalu jalankan ulang installer.");
    process.exit(1);
  }

  // ---- 2. Konfigurasi ------------------------------------------------
  log.langkah(2, TOTAL_LANGKAH, "Konfigurasi");
  const envLama = bacaEnv(path.join(SERVER, ".env"));
  const cfg = {
    host: envLama.MYSQL_HOST || "127.0.0.1",
    port: Number(envLama.MYSQL_PORT || 3306),
    user: envLama.MYSQL_USER || "root",
    password: envLama.MYSQL_PASSWORD || "",
    database: envLama.MYSQL_DATABASE || "dara_free",
  };
  let portServer = Number(envLama.PORT || 3001);
  let pasangContoh = !opsi.tanpaContoh;

  if (!opsi.otomatis) {
    console.log(warna.redup("  Tekan Enter untuk memakai nilai di dalam kurung siku.\n"));
    cfg.host = await tanya("Host MySQL", cfg.host);
    cfg.port = Number(await tanya("Port MySQL", String(cfg.port)));
    cfg.user = await tanya("User MySQL", cfg.user);
    cfg.password = (await tanyaRahasia("Password MySQL")) || cfg.password;
    cfg.database = await tanya("Nama database", cfg.database);
    portServer = Number(await tanya("Port server DARA", String(portServer)));
    if (!opsi.tanpaContoh) {
      pasangContoh = await tanyaYaTidak(
        "Pasang data contoh (penjualan, pegawai, lokasi, provinsi) untuk mencoba dashboard?", true
      );
    }
  }

  if (!/^[A-Za-z0-9_]+$/.test(cfg.database)) {
    log.galat(`Nama database "${cfg.database}" tidak valid — hanya huruf, angka, dan garis bawah.`);
    process.exit(1);
  }

  // ---- 3. Dependensi -------------------------------------------------
  log.langkah(3, TOTAL_LANGKAH, "Memasang dependensi");
  if (opsi.lewatiInstall) {
    log.peringatan("dilewati (--skip-install)");
  } else {
    log.info("server/ ...");
    jalankan("npm", ["install", "--no-audit", "--no-fund"], SERVER);
    log.info("client/ ...");
    jalankan("npm", ["install", "--no-audit", "--no-fund"], CLIENT);
    log.ok("dependensi terpasang");

    // Driver Data Connection tambahan (opsional) — mysql/postgres/cockroachdb/
    // sqlite_ext sudah otomatis ikut terpasang di atas. Driver lain (SQL
    // Server, Oracle, MongoDB, dst) BUTUH INTERNET dan sengaja tidak
    // dipasang otomatis — lihat drivers/registry.js. Bisa dilewati sekarang
    // dan dipasang kapan saja nanti lewat `npm run driver:install`.
    if (!opsi.otomatis) {
      log.kosong();
      const mauDriverTambahan = await tanyaYaTidak(
        "Pasang driver Data Connection tambahan sekarang (SQL Server, Oracle, MongoDB, dll — perlu internet)?",
        false
      );
      if (mauDriverTambahan) {
        // pathToFileURL WAJIB di Windows — import() dinamis menolak path
        // absolut mentah ("D:\...") sebagai specifier (lihat CHANGELOG.md).
        const { DRIVER_DEFS, getPackagesForKeys } = await import(
          pathToFileURL(path.join(SERVER, "src/modules/connections/drivers/registry.js"))
        );
        const opsional = DRIVER_DEFS.filter((d) => !d.preinstalled);
        console.log("");
        opsional.forEach((d) => console.log(`   · ${d.key.padEnd(14)} ${d.label}`));
        const jawab = await tanya("Ketik kunci driver dipisah koma (kosongkan untuk lewati)", "");
        const keys = jawab.split(",").map((s) => s.trim()).filter(Boolean);
        if (keys.length) {
          const { packages, unknown } = getPackagesForKeys(keys);
          if (unknown.length) {
            log.peringatan(`kunci tidak dikenal, dilewati: ${unknown.join(", ")}`);
          }
          if (packages.length) {
            log.info(`memasang: ${packages.join(", ")} ...`);
            jalankan("npm", ["install", "--no-audit", "--no-fund", ...packages], SERVER);
            log.ok(`driver ${keys.filter((k) => !unknown.includes(k)).join(", ")} siap dipakai`);
          }
        } else {
          log.info("dilewati — bisa dipasang kapan saja: cd server && npm run driver:install -- <kunci>");
        }
      } else {
        log.info("dilewati — bisa dipasang kapan saja: cd server && npm run driver:install -- <kunci>");
      }
    }
  }

  // ---- 4. Koneksi & database ----------------------------------------
  log.langkah(4, TOTAL_LANGKAH, "Menyiapkan database MySQL");
  const uji = await ujiKoneksi(SERVER, cfg);
  if (!uji.ok) {
    log.galat(`Gagal terhubung: ${uji.pesan}`);
    log.info("Perbaiki lalu jalankan ulang: npm run setup");
    process.exit(1);
  }
  log.ok(`terhubung ke MySQL ${uji.versi}`);
  await buatDatabase(SERVER, cfg);
  log.ok(`database "${cfg.database}" siap`);

  const cekLama = await cekInstalasiSebelumnya(SERVER, cfg);
  if (cekLama.adaInstalasiLama) {
    log.peringatan(
      `database "${cfg.database}" sudah berisi ${cekLama.jumlahTabel} tabel dara_* ` +
      `(${cekLama.jumlahMigrasi} migrasi tercatat) — kemungkinan dari instalasi sebelumnya.`
    );
    if (opsi.resetDb) {
      log.info("--reset-db dipakai: instalasi bersih akan dijalankan di langkah 6.");
    } else if (opsi.otomatis) {
      log.info("Mode --yes: melanjutkan tanpa menghapus data (pakai --reset-db juga bila ingin bersih).");
    } else {
      const pilihan = await tanyaPilihan("Database ini sudah pernah dipasangi DARA. Pilih:", [
        { label: "Lanjutkan seperti biasa", hint: "hanya jalankan migrasi yang belum diterapkan", value: "lanjut" },
        { label: "Instalasi BERSIH", hint: "hapus semua tabel dara_* lalu pasang ulang dari nol — DATA HILANG", value: "bersih" },
        { label: "Batalkan", value: "batal" },
      ], 0);
      if (pilihan === "batal") {
        log.info("Instalasi dibatalkan. Tidak ada yang diubah.");
        process.exit(0);
      }
      if (pilihan === "bersih") opsi.resetDb = true;
    }
  }

  // ---- 5. Tulis .env -------------------------------------------------
  log.langkah(5, TOTAL_LANGKAH, "Menulis konfigurasi");
  const jwt = envLama.JWT_SECRET && envLama.JWT_SECRET.length >= 32 && !/ganti/i.test(envLama.JWT_SECRET)
    ? envLama.JWT_SECRET
    : rahasiaAcak();

  // CONN_SECRET_KEY: pertahankan HANYA kalau sudah persis 64 karakter hex
  // valid (bukan placeholder ".env.example" seperti "ganti-dengan-...").
  // JANGAN PERNAH regenerasi kalau sudah valid — mengganti kunci ini bikin
  // password koneksi Data Connection yang SUDAH tersimpan tidak bisa
  // didekripsi lagi (lihat secretCipher.js).
  const connSecretKey = isHex64(envLama.CONN_SECRET_KEY)
    ? envLama.CONN_SECRET_KEY.trim()
    : kunciEnkripsi32Byte();

  tulisEnv(
    path.join(SERVER, ".env"),
    {
      DB_TYPE: "mysql",
      MYSQL_HOST: cfg.host,
      MYSQL_PORT: String(cfg.port),
      MYSQL_USER: cfg.user,
      MYSQL_PASSWORD: cfg.password,
      MYSQL_DATABASE: cfg.database,
      MYSQL_POOL_MAX: envLama.MYSQL_POOL_MAX || "10",
      DB_TABLE_PREFIX: envLama.DB_TABLE_PREFIX || "dara_data_",
      META_STORE: "mysql",
      PORT: String(portServer),
      SERVE_STATIC: envLama.SERVE_STATIC || "false",
      CORS_ORIGINS: envLama.CORS_ORIGINS || "http://localhost:5173",
      JWT_SECRET: jwt,
      CONN_SECRET_KEY: connSecretKey,
    },
    path.join(SERVER, ".env.example")
  );
  log.ok("server/.env");

  tulisEnv(
    path.join(CLIENT, ".env"),
    { VITE_API_URL: `http://localhost:${portServer}` },
    path.join(CLIENT, ".env.example")
  );
  log.ok("client/.env");

  if (jwt !== envLama.JWT_SECRET) log.ok("JWT_SECRET baru dibuat (acak 96 karakter hex)");
  if (connSecretKey !== envLama.CONN_SECRET_KEY) {
    log.ok("CONN_SECRET_KEY baru dibuat (acak 64 karakter hex) — dipakai mengenkripsi password koneksi Data Connection");
  }

  // ---- 6. Migrasi & seed ---------------------------------------------
  log.langkah(6, TOTAL_LANGKAH, "Membuat tabel dan mengisi data awal");
  const argMigrasi = ["scripts/migrate.mjs"];
  if (pasangContoh) argMigrasi.push("--with-sample");
  if (opsi.resetDb) argMigrasi.push("--reset");
  jalankan("node", argMigrasi, SERVER);

  // ---- 7. Build client -----------------------------------------------
  log.langkah(7, TOTAL_LANGKAH, "Membangun antarmuka (client)");
  if (opsi.lewatiBuild) {
    log.peringatan("dilewati (--skip-build)");
  } else {
    const build = opsi.otomatis ? true : await tanyaYaTidak(
      "Build client sekarang? (perlu untuk mode produksi satu port)", true
    );
    if (build) {
      jalankan("npm", ["run", "build"], CLIENT);
      log.ok("client/dist siap disajikan");
    } else {
      log.peringatan("dilewati — jalankan `npm run build` di folder client bila dibutuhkan");
    }
  }

  // ---- 8. Verifikasi -------------------------------------------------
  log.langkah(8, TOTAL_LANGKAH, "Verifikasi");
  const { tabel, pasti } = await ringkasanIsi(SERVER, cfg);
  log.ok(`${tabel.length} tabel dara* dibuat`);
  for (const [nama, n] of Object.entries(pasti)) {
    log.info(`${warna.redup("·")} ${nama.padEnd(24)} ${n} baris`);
  }

  const envFinal = bacaEnv(path.join(SERVER, ".env"));
  const masalah = [];
  if (envFinal.DB_TYPE !== "mysql") masalah.push("DB_TYPE bukan mysql");
  if (!envFinal.JWT_SECRET || envFinal.JWT_SECRET.length < 32) masalah.push("JWT_SECRET terlalu pendek");
  if (!isHex64(envFinal.CONN_SECRET_KEY)) masalah.push("CONN_SECRET_KEY tidak valid (harus 64 karakter hex)");
  if (!fs.existsSync(path.join(SERVER, "node_modules"))) masalah.push("dependensi server belum terpasang");
  if (masalah.length) {
    log.kosong();
    for (const m of masalah) log.peringatan(m);
  }

  // ---- Ringkasan ------------------------------------------------------
  console.log(warna.judul("\n✓ Instalasi selesai"));
  console.log(`
  ${warna.tebal("Menjalankan (mode pengembangan, dua terminal):")}
    Terminal 1:  cd server && npm run dev
    Terminal 2:  cd client && npm run dev
    Buka        ${warna.ok(`http://localhost:5173`)}

  ${warna.tebal("Menjalankan (mode produksi, satu port):")}
    cd client && npm run build
    setel SERVE_STATIC=true di server/.env
    cd server && npm start
    Buka        ${warna.ok(`http://localhost:${portServer}`)}

  ${warna.tebal("Login pertama:")}
    username    admin
    password    admin123
    ${warna.peringatan("SEGERA ganti:")} cd server && npm run create-admin

  ${warna.tebal("Bacaan lanjutan:")}
    INSTALL.md     langkah instalasi manual & pemecahan masalah
    USAGE.md       cara memakai: jelajah data → chart → dashboard → embed
    db/README.md   kamus data setiap tabel
`);
}

main()
  .catch((err) => {
    log.kosong();
    log.galat(err.message);
    console.log(warna.redup("\n  Perbaiki masalah di atas lalu jalankan ulang: npm run setup"));
    process.exitCode = 1;
  })
  .finally(tutupInput);
