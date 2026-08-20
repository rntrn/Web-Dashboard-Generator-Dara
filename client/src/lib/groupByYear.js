/**
 * groupByYear — kelompokkan item (punya `createdAt`) per TAHUN pembuatan.
 * @returns {Array<[year:number, items:Array]>} urut tahun terbaru dulu.
 */
export function groupByYear(items = []) {
  const map = new Map();
  for (const it of items) {
    const y = it.createdAt ? new Date(it.createdAt).getFullYear() : 0;
    if (!map.has(y)) map.set(y, []);
    map.get(y).push(it);
  }
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

export default groupByYear;
