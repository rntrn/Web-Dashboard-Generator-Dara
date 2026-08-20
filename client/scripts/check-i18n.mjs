/**
 * check-i18n.mjs — pemeriksa konsistensi terjemahan (parity kunci antar bahasa).
 *
 * Menjamin: setiap kunci ada di SEMUA bahasa (id, en, ...). Kunci yang tertinggal
 * di salah satu bahasa akan dilaporkan, dan skrip keluar dengan kode 1 (gagal)
 * sehingga bisa dipakai sebelum commit / di CI.
 *
 * Jalankan:  npm run i18n:check     (atau: node scripts/check-i18n.mjs)
 *
 * Cara kerja: membaca src/i18n/translations.js sebagai teks lalu mengevaluasinya
 * secara terkendali (file itu murni data), jadi tidak tergantung sistem modul.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "../src/i18n/translations.js");

function loadTranslations(path) {
  const src = readFileSync(path, "utf8");
  const holder = {};
  const code = src.replace(/export const/g, "holder.").replace(/export default[^;]*;?/g, "");
  // eslint-disable-next-line no-new-func
  new Function("holder", code)(holder);
  return holder.translations || {};
}

function main() {
  const t = loadTranslations(FILE);
  const langs = Object.keys(t);
  if (langs.length < 2) {
    console.log(`[i18n] Hanya ${langs.length} bahasa — tidak ada yang dibandingkan.`);
    return 0;
  }

  const allKeys = new Set();
  for (const l of langs) for (const k of Object.keys(t[l])) allKeys.add(k);

  let problems = 0;
  for (const l of langs) {
    const keys = new Set(Object.keys(t[l]));
    const missing = [...allKeys].filter((k) => !keys.has(k));
    console.log(`[i18n] ${l}: ${keys.size} kunci` + (missing.length ? `  ✗ hilang ${missing.length}` : "  ✓"));
    if (missing.length) {
      problems += missing.length;
      for (const k of missing) console.log(`         - hilang: "${k}"`);
    }
  }

  for (const l of langs) {
    for (const [k, v] of Object.entries(t[l])) {
      if (v == null || String(v).trim() === "") {
        console.log(`[i18n] ${l}: nilai kosong pada "${k}"`);
        problems += 1;
      }
    }
  }

  if (problems === 0) {
    console.log(`[i18n] ✓ Semua ${allKeys.size} kunci lengkap & terisi di ${langs.length} bahasa (${langs.join(", ")}).`);
    return 0;
  }
  console.log(`[i18n] ✗ Ditemukan ${problems} masalah. Lengkapi kunci di src/i18n/translations.js.`);
  return 1;
}

process.exit(main());
