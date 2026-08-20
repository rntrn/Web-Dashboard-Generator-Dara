/**
 * env.js — baca & tulis berkas .env tanpa merusak isi yang sudah ada.
 *
 * Aturan penulisan:
 *   - kunci yang sudah ada DIGANTI nilainya (baris & komentar sekitarnya tetap)
 *   - kunci baru ditambahkan di akhir berkas
 *   - berkas lama dicadangkan jadi .env.bak sebelum ditimpa
 *
 * Ini penting supaya menjalankan installer ulang tidak menghapus penyesuaian
 * manual yang sudah Anda tulis di .env.
 */

import fs from "fs";
import path from "path";

/** Parse isi .env jadi objek { KUNCI: nilai }. Komentar diabaikan. */
export function bacaEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const baris of fs.readFileSync(file, "utf-8").split(/\r?\n/)) {
    const t = baris.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

/**
 * Tulis pasangan kunci-nilai ke .env.
 * @param {string} file    path .env tujuan
 * @param {object} nilai   { KUNCI: nilai }
 * @param {string} [dasar] path .env.example dipakai sebagai kerangka bila .env
 *                         belum ada, supaya komentar penjelasnya ikut terbawa
 */
export function tulisEnv(file, nilai, dasar = null) {
  let isi = "";
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, file + ".bak");
    isi = fs.readFileSync(file, "utf-8");
  } else if (dasar && fs.existsSync(dasar)) {
    isi = fs.readFileSync(dasar, "utf-8");
  }

  const baris = isi.split(/\r?\n/);
  const belumDitulis = new Set(Object.keys(nilai));

  const hasil = baris.map((b) => {
    const t = b.trim();
    if (!t || t.startsWith("#")) return b;
    const i = t.indexOf("=");
    if (i === -1) return b;
    const kunci = t.slice(0, i).trim();
    if (!(kunci in nilai)) return b;
    belumDitulis.delete(kunci);
    return `${kunci}=${nilai[kunci]}`;
  });

  if (belumDitulis.size) {
    hasil.push("", "# --- ditambahkan oleh installer ---");
    for (const k of belumDitulis) hasil.push(`${k}=${nilai[k]}`);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, hasil.join("\n").replace(/\n{3,}$/, "\n"));
}

export default { bacaEnv, tulisEnv };
