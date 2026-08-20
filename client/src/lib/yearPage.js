/**
 * yearPage — bantu filter TAHUN + PAGINATION untuk daftar item (punya createdAt).
 * Dipakai daftar chart/dashboard/story tersimpan agar tidak kepenuhan layar.
 *
 * @param {Array} items
 * @param {object} opt { year: number|"all", page: number, pageSize: number }
 * @returns {{ years:number[], filtered:Array, pageItems:Array, total:number, totalPages:number }}
 */
export function yearPage(items = [], { year = "all", page = 1, pageSize = 8 } = {}) {
  const yearOf = (it) => (it.createdAt ? new Date(it.createdAt).getFullYear() : 0);
  const years = [...new Set(items.map(yearOf))].sort((a, b) => b - a);
  const filtered = year === "all" ? items : items.filter((it) => yearOf(it) === year);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), totalPages);
  const pageItems = filtered.slice((p - 1) * pageSize, p * pageSize);
  return { years, filtered, pageItems, total, totalPages };
}

export default yearPage;
