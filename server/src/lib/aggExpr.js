/**
 * aggExpr — SATU sumber kebenaran ekspresi SQL agregasi (driver-aware).
 *
 * Dipakai suggestions.repository (aggregate/aggregateJoin/aggregateMulti) &
 * exports.service (SQL template) agar konsisten. Menambah agregasi baru = cukup
 * di sini + daftar AGGS.
 *
 * Aturan dasar:
 *   - Tanpa measure ATAU "COUNT"  -> COUNT(*)           (hitung baris)
 *   - "DISTINCT"                  -> COUNT(DISTINCT x)   (hitung nilai unik)
 *   - SUM/AVG/MIN/MAX             -> AGG(x)
 *
 * Agregasi statistik (butuh measure; tanpa measure jatuh ke COUNT(*)):
 *   - "MEDIAN"                    -> nilai tengah
 *   - "P90" / "P95"              -> persentil ke-90 / ke-95
 *
 * Statistik butuh dukungan database:
 *   - SQLite (sql.js) tak punya MEDIAN/PERCENTILE bawaan → DARA mendaftarkan
 *     fungsi agregat kustom `MED(x)` & `PCT(x,p)` saat init
 *     (lihat config/database.js).
 *   - MySQL 8 juga TIDAK punya MEDIAN maupun PERCENTILE_CONT. Belum ada padanan
 *     satu-baris yang aman, jadi agregasi ini DITOLAK dengan pesan jelas
 *     alih-alih diam-diam menghasilkan angka yang salah.
 *
 * Karena itu aggExpr menerima `dbType` agar sintaksnya tepat per driver.
 */

/** Agregasi yang diizinkan (validasi input). */
export const AGGS = ["SUM", "AVG", "COUNT", "MIN", "MAX", "DISTINCT", "MEDIAN", "P90", "P95"];

/** Persentil (0..1) untuk tiap agregasi statistik berbasis persentil. */
const PERCENTILE = { P90: 0.9, P95: 0.95 };

/** Pesan seragam saat agregasi statistik belum didukung driver aktif. */
const UNSUPPORTED_STAT = (agg) =>
  `Agregasi ${agg} belum didukung pada MySQL. Pakai SUM/AVG/MIN/MAX/COUNT, ` +
  `atau jalankan DARA dengan DB_TYPE=sqlite untuk analisa statistik.`;

/** Normalisasi agregasi ke salah satu AGGS (default sesuai ada/tidaknya measure). */
export function normalizeAgg(agg, hasMeasure) {
  const a = String(agg || "").toUpperCase();
  if (AGGS.includes(a)) return a;
  return hasMeasure ? "SUM" : "COUNT";
}

/**
 * Bangun ekspresi nilai agregat.
 * @param {string} agg      SUM|AVG|COUNT|MIN|MAX|DISTINCT|MEDIAN|P90|P95
 * @param {string|null} col ekspresi kolom SIAP-PAKAI (sudah ter-quote/prefiks),
 *                          mis. `"nilai"` atau `t1."nilai"`. null/"" = tanpa measure.
 * @param {"mysql"|"sqlite"} [dbType="mysql"] penentu sintaks statistik.
 * @returns {string} ekspresi SQL, mis. `SUM(\`nilai\`)` / `MED("nilai")`
 * @throws {Error} bila agregasi statistik diminta pada driver yang belum mendukung
 */
export function aggExpr(agg, col, dbType = "mysql") {
  if (!col || agg === "COUNT") return "COUNT(*)";
  if (agg === "DISTINCT") return `COUNT(DISTINCT ${col})`;

  if (agg === "MEDIAN") {
    if (dbType === "mysql") throw new Error(UNSUPPORTED_STAT("MEDIAN"));
    return `MED(${col})`;
  }
  if (agg === "P90" || agg === "P95") {
    if (dbType === "mysql") throw new Error(UNSUPPORTED_STAT(agg));
    return `PCT(${col}, ${PERCENTILE[agg]})`;
  }

  return `${agg}(${col})`; // SUM/AVG/MIN/MAX
}

export default aggExpr;
