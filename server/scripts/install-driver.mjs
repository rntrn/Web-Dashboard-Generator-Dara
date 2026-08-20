#!/usr/bin/env node
/**
 * install-driver.mjs — cara TERMUDAH memasang driver Data Connection
 * tambahan (Microsoft SQL Server, Oracle, MongoDB, dst) setelah instalasi
 * DARA berjalan. Baca nama paket dari SATU sumber kebenaran
 * (drivers/registry.js) supaya tidak ada daftar paket yang harus diketik
 * ulang/dihafal — cukup sebut KUNCI driver-nya (sama seperti yang tampil
 * di menu Data Connection).
 *
 * BUTUH INTERNET — script ini menjalankan `npm install` sungguhan.
 *
 * Pemakaian (dari folder server/):
 *   node scripts/install-driver.mjs --list          daftar semua driver + status
 *   node scripts/install-driver.mjs mssql            pasang 1 driver
 *   node scripts/install-driver.mjs mssql mongodb     pasang beberapa sekaligus
 *   node scripts/install-driver.mjs --all             pasang SEMUA driver non-bawaan
 *                                                      (berat — jarang perlu semua)
 *
 * Atau lewat npm script (server/package.json):
 *   npm run driver:install -- mssql
 *   npm run driver:install -- --list
 *
 * Driver yang sudah `preinstalled: true` (mysql, postgres, cockroachdb,
 * sqlite_ext) otomatis dilewati — tidak perlu apa-apa lagi.
 */

import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadRegistry() {
  // pathToFileURL WAJIB di Windows: import() dinamis tidak menerima path
  // absolut mentah ("D:\...") sebagai specifier, harus berupa URL file://.
  // Tanpa ini script gagal di Windows dengan error "Only URLs with a scheme
  // in: file, data, and node are supported" — lihat CHANGELOG.md.
  const target = pathToFileURL(path.join(__dirname, "../src/modules/connections/drivers/registry.js"));
  const mod = await import(target);
  return mod;
}

function printList(defs) {
  console.log("\nDriver Data Connection yang dikenal DARA:\n");
  for (const d of defs) {
    const status = d.preinstalled ? "sudah terpasang bawaan" : `paket: ${(d.npmPackages || []).join(", ") || "-"}`;
    console.log(`  ${d.key.padEnd(14)} ${d.label.padEnd(32)} ${status}`);
  }
  console.log("\nContoh: node scripts/install-driver.mjs mssql mongodb\n");
}

async function main() {
  const args = process.argv.slice(2);
  const { DRIVER_DEFS, getPackagesForKeys } = await loadRegistry();

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printList(DRIVER_DEFS);
    console.log("Jalankan dengan --list untuk daftar ini lagi, atau sebutkan kunci driver yang mau dipasang.");
    return;
  }

  if (args.includes("--list")) {
    printList(DRIVER_DEFS);
    return;
  }

  const keys = args.includes("--all")
    ? DRIVER_DEFS.filter((d) => !d.preinstalled).map((d) => d.key)
    : args.filter((a) => !a.startsWith("--"));

  const { packages, unknown } = getPackagesForKeys(keys);

  if (unknown.length) {
    console.error(`\n✗ Kunci driver tidak dikenal: ${unknown.join(", ")}`);
    console.error("  Jalankan `node scripts/install-driver.mjs --list` untuk melihat kunci yang valid.\n");
    process.exitCode = 1;
    return;
  }

  if (packages.length === 0) {
    console.log("\n✓ Semua driver yang diminta sudah terpasang bawaan — tidak ada yang perlu di-install.\n");
    return;
  }

  console.log(`\n→ Memasang ${packages.length} paket untuk driver: ${keys.join(", ")}`);
  console.log(`  Paket: ${packages.join(", ")}`);
  console.log("  Butuh koneksi internet — mengunduh dari registry npm...\n");

  const r = spawnSync("npm", ["install", "--no-audit", "--no-fund", ...packages], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (r.status !== 0) {
    console.error("\n✗ Gagal memasang paket — periksa koneksi internet atau nama paket di atas.");
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ Selesai. Restart server (npm run dev / npm start) supaya driver ${keys.join(", ")} bisa dipakai.\n`);
}

main().catch((err) => {
  console.error("✗ install-driver.mjs gagal:", err.message);
  process.exitCode = 1;
});
