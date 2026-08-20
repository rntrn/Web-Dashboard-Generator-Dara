/**
 * tableImport.js — logika BERSAMA untuk "bikin tabel dara_data_* dari data
 * tabular mentah" (array kolom + array baris), dipakai oleh DUA jalur:
 *   1. uploads.service.js       — sumbernya file CSV/Excel yang di-parse client.
 *   2. connections/connImports.service.js — sumbernya adapter Data Connection
 *      (server/src/modules/connections/drivers/*.driver.js), Fase 1.
 *
 * Awalnya logika ini cuma ada di uploads.service.js. Diekstrak ke sini v0.42.0
 * supaya DUA jalur itu punya perilaku penamaan kolom/deteksi tipe/sanitasi
 * yang IDENTIK (satu sumber kebenaran), bukan disalin-tempel dan lama-lama
 * menyimpang. Kalau mengubah perilaku di sini, efeknya ke KEDUA jalur —
 * jalankan tes upload SEKALIGUS tes import koneksi sebelum commit.
 */

export const ID_MAX = 30; // sengaja lebih pendek dari batas MySQL (64) — lihat catatan di uploads.service.js

/**
 * Akhiran unik untuk nama tabel hasil materialize (`..._${uniqueTableSuffix()}`).
 * Sebelumnya ketiga jalur (upload/import/dataprep) cuma pakai
 * `Date.now().toString(36)` — SECARA TEORI bisa tabrakan kalau dua
 * request selesai di milidetik yang sama (ditemukan saat uji beruntun
 * dataprep.service.js: dua `save()` cepat berturutan menghasilkan nama
 * tabel identik → `CREATE TABLE` gagal "already exists"). Ditambah
 * potongan acak pendek supaya praktis tidak mungkin tabrakan.
 */
export function uniqueTableSuffix() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Ubah string jadi identifier aman (huruf awal, [a-z0-9_], ≤ID_MAX). */
export function safeIdent(name, fallback = "kol") {
  let s = String(name || "").trim().toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s || !/^[a-z]/.test(s)) s = "k_" + s;
  return s.slice(0, ID_MAX) || fallback;
}

/** Kolom unik (tangani duplikat setelah sanitasi). */
export function uniqueCols(names) {
  const used = new Set(), out = [];
  names.forEach((n, i) => {
    let s = safeIdent(n, `kol${i + 1}`);
    let base = s.slice(0, ID_MAX - 3), k = s, c = 1;
    while (used.has(k)) k = `${base}_${++c}`;
    used.add(k); out.push(k);
  });
  return out;
}

export const isNum = (v) => v !== "" && v != null && /^-?\d+(\.\d+)?$/.test(String(v).trim());

// --- Sanitasi sisi-SERVER (jangan percaya scan client yang bisa dilewati) ---
// RegExp via konstruktor agar tak menaruh byte kontrol literal di source.
const CTRL_RE = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");
const FORMULA_RE = /^[=+\-@\t\r]/;   // sel diawali ini = potensi injeksi rumus (Excel/Sheets)
const CELL_MAX = 4000;               // batas panjang satu sel

/** Bersihkan satu sel sesuai tipe kolom (num/text). Diekspor untuk uji. */
export function sanitizeCell(v, type) {
  if (v === "" || v == null) return null;
  if (type === "num") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;   // non-numerik pada kolom num → null
  }
  let s = String(v).replace(CTRL_RE, "");    // buang karakter kontrol
  if (FORMULA_RE.test(s)) s = "'" + s;       // netralkan injeksi rumus (CSV injection)
  return s.slice(0, CELL_MAX);               // batasi panjang sel
}

/** Tebak tiap kolom numerik / teks dari sampel baris (array-of-array). */
export function inferTypes(cols, rows) {
  const sample = rows.slice(0, 500);
  return cols.map((_, ci) => {
    let seen = false;
    for (const r of sample) {
      const v = r[ci];
      if (v === "" || v == null) continue;
      seen = true;
      if (!isNum(v)) return "text";
    }
    return seen ? "num" : "text"; // kolom kosong → text
  });
}

export default { ID_MAX, safeIdent, uniqueCols, isNum, sanitizeCell, inferTypes, uniqueTableSuffix };
