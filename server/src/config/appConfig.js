/**
 * appConfig.js — konfigurasi IDENTITAS & TEMA aplikasi DARA (global, admin).
 * Pola sama dengan MANDOR: disimpan JSON di server/data/appconfig.json (gitignored),
 * default di kode. Frontend menerapkannya ke CSS variables + nama/logo/favicon.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../../data");
const FILE = path.join(DATA_DIR, "appconfig.json");

/** Nilai bawaan (identitas DARA + aksen teal→sky). */
export const DEFAULTS = {
  appName: "DARA",
  tagline: "Dashboard & Reporting Generator",
  logo: "📊",
  logoImage: "",
  faviconImage: "",
  companyImage: "",
  company: "",
  companyIcon: "",
  contributors: [],
  theme: {
    accent: "#14b8a6",   // teal-500  -> --dara-accent
    accent2: "#0ea5e9",  // sky-500   -> --dara-accent-2
    bg: "#f1f5f9",       // slate-100 -> --dara-bg
    font: "system",
  },
};

function merge(base, patch) {
  const out = { ...base, ...patch };
  out.theme = { ...base.theme, ...(patch && patch.theme) };
  if (!Array.isArray(out.contributors)) out.contributors = [];
  return out;
}

/** Baca config (defaults + file bila ada). Tidak melempar. */
export function getConfig() {
  try {
    return merge(DEFAULTS, JSON.parse(fs.readFileSync(FILE, "utf8")));
  } catch {
    return { ...DEFAULTS, theme: { ...DEFAULTS.theme } };
  }
}

/** Simpan patch (digabung ke config saat ini). */
export function saveConfig(patch) {
  const next = merge(getConfig(), patch || {});
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export default { getConfig, saveConfig, DEFAULTS };
