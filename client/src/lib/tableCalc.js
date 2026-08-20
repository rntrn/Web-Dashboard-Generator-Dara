/**
 * tableCalc — kalkulasi tabel (post-agregasi) untuk baris {d1,d2?,v1,v2?}.
 * Murni (tanpa efek samping) → mudah diuji & dipakai ulang.
 *
 * Diterapkan di ChartPreview SEBELUM membangun option ECharts, mengikuti urutan
 * baris yang sudah ada (backend mengurutkan by nilai / kronologis).
 *
 *   pct_of_total  : v1 menjadi persen dari total v1  (mis. komposisi)
 *   running_total : v1 menjadi jumlah kumulatif      (mis. akumulasi)
 */

export const TABLE_CALC_OPTIONS = [
  { id: "", label: "Tanpa kalkulasi" },
  { id: "pct_of_total", label: "% dari total" },
  { id: "running_total", label: "Running total (kumulatif)" },
];

/** Terapkan kalkulasi ke v1. Mengembalikan array BARU (rows asli tak diubah). */
export function applyTableCalc(rows, calc) {
  if (!calc || !Array.isArray(rows) || rows.length === 0) return rows;

  if (calc === "pct_of_total") {
    const total = rows.reduce((s, r) => s + (Number(r.v1) || 0), 0) || 1;
    return rows.map((r) => ({ ...r, v1: ((Number(r.v1) || 0) / total) * 100 }));
  }
  if (calc === "running_total") {
    let acc = 0;
    return rows.map((r) => { acc += Number(r.v1) || 0; return { ...r, v1: acc }; });
  }
  return rows;
}

export default applyTableCalc;
