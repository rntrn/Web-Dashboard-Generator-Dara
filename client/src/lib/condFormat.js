/**
 * condFormat — conditional formatting untuk sel Tabel/Pivot (murni, teruji).
 *
 * Spesifikasi (disimpan di chart.condFormat):
 *   {
 *     mode: "scale" | "rules",
 *     color: "#RRGGBB",              // warna dasar untuk mode "scale"
 *     rules: [                        // untuk mode "rules" (aturan pertama yang cocok menang)
 *       { op: ">"|">="|"<"|"<="|"="|"between", value: number, value2?: number, color: "#RRGGBB" }
 *     ]
 *   }
 *
 * - mode "scale": warnai sel dari terang (nilai min) ke `color` (nilai maks),
 *   memberi efek "heat"/data-bar halus. Butuh rentang [min,max] kolom.
 * - mode "rules": kembalikan warna aturan pertama yang terpenuhi, else null.
 *
 * `cellStyle` mengembalikan { backgroundColor, color } atau null (tanpa gaya).
 * Warna teks otomatis (hitam/putih) mengikuti kecerahan latar → selalu terbaca.
 */

export const COND_OPS = [">", ">=", "<", "<=", "=", "between"];

/** #RRGGBB -> {r,g,b}. Kembalikan null bila format salah. */
function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Campur warna putih -> base pada rasio t (0..1). t kecil = lebih terang. */
function mixWhite(base, t) {
  const c = Math.max(0, Math.min(1, t));
  return {
    r: Math.round(255 + (base.r - 255) * c),
    g: Math.round(255 + (base.g - 255) * c),
    b: Math.round(255 + (base.b - 255) * c),
  };
}

/** Pilih warna teks kontras (hitam/putih) berdasar luminance latar. */
function contrastText({ r, g, b }) {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111827" : "#ffffff";
}

const rgbCss = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;

/** Cek satu aturan terhadap nilai. */
function ruleMatches(rule, v) {
  const a = Number(rule.value);
  switch (rule.op) {
    case ">":  return v > a;
    case ">=": return v >= a;
    case "<":  return v < a;
    case "<=": return v <= a;
    case "=":  return v === a;
    case "between": {
      const b = Number(rule.value2);
      const lo = Math.min(a, b), hi = Math.max(a, b);
      return v >= lo && v <= hi;
    }
    default: return false;
  }
}

/**
 * Hitung gaya sel untuk sebuah nilai.
 * @param {number} value
 * @param {object|null} cf   spesifikasi condFormat
 * @param {{min:number,max:number}} [range]  rentang kolom (untuk mode "scale")
 * @returns {{backgroundColor:string,color:string}|null}
 */
export function cellStyle(value, cf, range) {
  if (!cf || value == null || value === "" || Number.isNaN(Number(value))) return null;
  const v = Number(value);

  if (cf.mode === "rules") {
    for (const rule of cf.rules || []) {
      const rgb = hexToRgb(rule.color);
      if (rgb && ruleMatches(rule, v)) {
        return { backgroundColor: rgbCss(rgb), color: contrastText(rgb) };
      }
    }
    return null;
  }

  if (cf.mode === "scale") {
    const base = hexToRgb(cf.color) || { r: 59, g: 130, b: 246 };
    const min = range ? Number(range.min) : v;
    const max = range ? Number(range.max) : v;
    const t = max > min ? (v - min) / (max - min) : 1;
    // Peta ke 0.15..1 agar nilai terkecil tetap sedikit terwarnai.
    const bg = mixWhite(base, 0.15 + 0.85 * t);
    return { backgroundColor: rgbCss(bg), color: contrastText(bg) };
  }

  return null;
}

/** Rentang {min,max} dari daftar nilai numerik (abaikan non-angka). */
export function valueRange(values) {
  const nums = (values || []).map(Number).filter((n) => !Number.isNaN(n));
  if (!nums.length) return { min: 0, max: 0 };
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

export default cellStyle;
