/**
 * ui.js — utilitas tampilan & tanya-jawab untuk installer.
 *
 * Tidak memakai pustaka pihak ketiga sama sekali. Alasannya: installer harus
 * bisa jalan SEBELUM `npm install` dijalankan. Kalau installer punya dependensi,
 * kita butuh install untuk bisa install — masalah ayam-telur.
 */

import readline from "readline";

// Warna ANSI. Dimatikan otomatis bila keluaran dialihkan ke berkas
// (mis. `npm run setup > log.txt`) supaya log-nya tidak penuh kode escape.
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));

export const warna = {
  judul: c("1;36"),   // cyan tebal
  ok: c("32"),        // hijau
  peringatan: c("33"),// kuning
  galat: c("31"),     // merah
  redup: c("90"),     // abu-abu
  tebal: c("1"),
};

export const log = {
  judul: (s) => console.log(`\n${warna.judul(s)}\n${warna.redup("─".repeat(Math.max(8, s.length)))}`),
  info: (s) => console.log(`  ${s}`),
  ok: (s) => console.log(`  ${warna.ok("✓")} ${s}`),
  peringatan: (s) => console.log(`  ${warna.peringatan("!")} ${s}`),
  galat: (s) => console.log(`  ${warna.galat("✗")} ${s}`),
  langkah: (n, total, s) => console.log(`\n${warna.tebal(`[${n}/${total}]`)} ${s}`),
  kosong: () => console.log(""),
};

let rl = null;
function getRl() {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl;
}

export function tutupInput() {
  if (rl) { rl.close(); rl = null; }
}

/**
 * Tanya teks bebas.
 * @param {string} pertanyaan
 * @param {string} [bawaan] nilai yang dipakai bila pengguna langsung Enter
 */
export function tanya(pertanyaan, bawaan = "") {
  const suffix = bawaan ? warna.redup(` [${bawaan}]`) : "";
  return new Promise((resolve) => {
    getRl().question(`  ${pertanyaan}${suffix}: `, (jawab) => {
      resolve((jawab || "").trim() || bawaan);
    });
  });
}

/** Tanya password — karakter tidak ditampilkan. */
export function tanyaRahasia(pertanyaan) {
  return new Promise((resolve) => {
    const r = getRl();
    const onData = () => {
      process.stdout.clearLine?.(0);
      process.stdout.cursorTo?.(0);
      process.stdout.write(`  ${pertanyaan}: ${"*".repeat(r.line.length)}`);
    };
    process.stdin.on("data", onData);
    r.question(`  ${pertanyaan}: `, (jawab) => {
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(jawab);
    });
  });
}

/** Tanya ya/tidak. */
export async function tanyaYaTidak(pertanyaan, bawaan = true) {
  const petunjuk = bawaan ? "Y/t" : "y/T";
  const jawab = (await tanya(`${pertanyaan} (${petunjuk})`)).toLowerCase();
  if (!jawab) return bawaan;
  return ["y", "ya", "yes"].includes(jawab);
}

/** Tanya pilihan bernomor. Mengembalikan nilai `value` dari opsi terpilih. */
export async function tanyaPilihan(pertanyaan, opsi, indeksBawaan = 0) {
  console.log(`  ${pertanyaan}`);
  opsi.forEach((o, i) => {
    const tanda = i === indeksBawaan ? warna.ok("→") : " ";
    console.log(`   ${tanda} ${i + 1}) ${o.label}${o.hint ? warna.redup("  — " + o.hint) : ""}`);
  });
  const jawab = await tanya("Pilih nomor", String(indeksBawaan + 1));
  const idx = parseInt(jawab, 10) - 1;
  return opsi[Number.isInteger(idx) && opsi[idx] ? idx : indeksBawaan].value;
}
