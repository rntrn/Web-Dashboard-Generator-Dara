/**
 * filterSql — bangun klausa WHERE dari daftar filter (driver-aware, binding aman).
 *
 * Bentuk filter yang didukung:
 *   { column, value }              -> col = ?            (equality)
 *   { column, values: [...] }      -> col IN (?,?,...)   (multi-pilih)
 *   { column, from, to }           -> col >= ? AND col <= ? (rentang; tanggal/angka)
 *
 * Nilai berbentuk 'YYYY-MM-DD' pada rentang dibandingkan langsung — MySQL dan
 * SQLite sama-sama menerimanya terhadap kolom DATE/DATETIME tanpa konversi.
 * Fungsi bindVal() di bawah dipertahankan sebagai titik sisip bila kelak ada
 * driver yang butuh pembungkus (mis. TO_DATE pada Oracle).
 */

const isDateStr = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

const isSafeName = (n) => typeof n === "string" && /^[A-Za-z0-9_]+$/.test(n);
const isScalar = (v) =>
  (typeof v === "string" || typeof v === "number") && String(v).length <= 200;

/**
 * Sanitasi array filter dari query/URL. Menerima 3 bentuk aman:
 *   { column, value }           (equality)
 *   { column, values: [...] }   (multi-pilih, maks 200 item)
 *   { column, from, to }        (rentang tanggal/angka)
 * Item/kolom tak valid dibuang diam-diam (chart tetap jalan).
 * @param {any} raw - hasil JSON.parse (harus array) atau array langsung
 * @returns {Array} filter bersih siap dipakai buildFilterClause
 */
export function sanitizeFilters(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const f of arr) {
    if (!f || !isSafeName(f.column)) continue;
    if (Array.isArray(f.values)) {
      const values = f.values.filter(isScalar).slice(0, 200);
      if (values.length) out.push({ column: f.column, values });
    } else if (f.from != null || f.to != null) {
      const range = { column: f.column };
      if (isScalar(f.from)) range.from = f.from;
      if (isScalar(f.to)) range.to = f.to;
      if (range.from != null || range.to != null) out.push(range);
    } else if (isScalar(f.value)) {
      out.push({ column: f.column, value: f.value });
    }
  }
  return out;
}

/**
 * @param {Array} filters
 * @param {Set<string>} colSet - nama kolom UPPERCASE yang valid di tabel
 * @param {object} opt - { dbType, ident } ident(col)->string ter-quote sesuai driver
 * @returns {{ where:string, params:any[] }}
 */
export function buildFilterClause(filters, colSet, { dbType, ident }) {
  const parts = [];
  const params = [];

  // MySQL dan SQLite sama-sama menerima string 'YYYY-MM-DD' dibandingkan
  // langsung dengan kolom DATE/DATETIME, jadi tidak perlu fungsi konversi.
  // Fungsi ini dipertahankan sebagai titik sisip bila nanti ada driver yang
  // memerlukannya (mis. TO_DATE pada Oracle).
  const bindVal = () => "?";

  for (const f of filters || []) {
    if (!f || !f.column || !colSet.has(String(f.column).toUpperCase())) continue;
    const col = ident(f.column);

    if (Array.isArray(f.values)) {
      const vals = f.values.filter((v) => v != null && v !== "");
      if (!vals.length) continue;
      parts.push(`${col} IN (${vals.map(() => "?").join(",")})`);
      params.push(...vals);
    } else if (f.from != null || f.to != null) {
      if (f.from != null && f.from !== "") { parts.push(`${col} >= ${bindVal(f.from)}`); params.push(f.from); }
      if (f.to != null && f.to !== "") { parts.push(`${col} <= ${bindVal(f.to)}`); params.push(f.to); }
    } else if (f.value != null && f.value !== "") {
      parts.push(`${col} = ?`);
      params.push(f.value);
    }
  }
  return { where: parts.length ? `WHERE ${parts.join(" AND ")}` : "", params };
}

export default buildFilterClause;
