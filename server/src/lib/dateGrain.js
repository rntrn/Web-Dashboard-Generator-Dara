/**
 * dateGrain — ekspresi SQL untuk mengelompokkan kolom tanggal ke tingkat
 * (hierarki waktu): tahun → bulan → hari. Driver-aware (MySQL vs SQLite).
 *
 * Dipakai suggestions.repository.aggregateMulti bila chart menyetel `dateGrain`
 * pada dimensi PERTAMA (biasanya dimensi waktu). Ini memberi efek "drill" yang
 * bisa dipilih: ganti grain → kelompok berubah year/month/day.
 *
 * Mengembalikan ekspresi teks (label) yang stabil & bisa diurutkan kronologis:
 *   year  -> "2024"
 *   month -> "2024-03"
 *   day   -> "2024-03-15"
 */

export const DATE_GRAINS = ["year", "month", "day"];

/**
 * @param {string} col   ekspresi kolom SIAP-PAKAI (sudah ter-quote/prefiks)
 * @param {string} grain year|month|day (selain itu → kolom apa adanya)
 * @param {"mysql"|"sqlite"} dbType
 * @returns {string} ekspresi SQL
 */
export function dateGrainExpr(col, grain, dbType = "mysql") {
  if (!DATE_GRAINS.includes(grain)) return col;
  if (dbType === "mysql") {
    // DATE_FORMAT memakai penanda yang sama dengan strftime untuk ketiga
    // tingkat ini (%Y/%m/%d), tapi ditulis eksplisit agar tidak menebak.
    const fmt = grain === "year" ? "%Y" : grain === "month" ? "%Y-%m" : "%Y-%m-%d";
    return `DATE_FORMAT(${col}, '${fmt}')`;
  }
  // sqlite (sql.js)
  const fmt = grain === "year" ? "%Y" : grain === "month" ? "%Y-%m" : "%Y-%m-%d";
  return `strftime('${fmt}', ${col})`;
}

export default dateGrainExpr;
