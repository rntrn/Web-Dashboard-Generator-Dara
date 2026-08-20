/**
 * relativeDate — preset rentang tanggal relatif → {from, to} (YYYY-MM-DD).
 * Murni & deterministik (menerima `today` opsional agar mudah diuji).
 *
 * Dipakai slicer daterange sebagai tombol cepat: "7 hari terakhir", "Bulan ini",
 * dst. Hasilnya rentang absolut biasa, jadi backend tak perlu logika khusus.
 */

const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const RELATIVE_PRESETS = [
  { id: "today", label: "Hari ini" },
  { id: "last7", label: "7 hari terakhir" },
  { id: "last30", label: "30 hari terakhir" },
  { id: "last90", label: "90 hari terakhir" },
  { id: "thisMonth", label: "Bulan ini" },
  { id: "thisYear", label: "Tahun ini" },
  { id: "ytd", label: "Awal tahun s/d kini" },
];

/**
 * @param {string} preset id dari RELATIVE_PRESETS
 * @param {Date} [today] acuan "hari ini" (default: sekarang)
 * @returns {{from:string,to:string}|null}
 */
export function relativeRange(preset, today = new Date()) {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOf = (d) => fmt(d);
  const minusDays = (n) => {
    const d = new Date(end);
    d.setDate(d.getDate() - n);
    return d;
  };
  switch (preset) {
    case "today":     return { from: startOf(end), to: startOf(end) };
    case "last7":     return { from: fmt(minusDays(6)), to: fmt(end) };
    case "last30":    return { from: fmt(minusDays(29)), to: fmt(end) };
    case "last90":    return { from: fmt(minusDays(89)), to: fmt(end) };
    case "thisMonth": return { from: fmt(new Date(end.getFullYear(), end.getMonth(), 1)), to: fmt(end) };
    case "thisYear":  return { from: fmt(new Date(end.getFullYear(), 0, 1)), to: fmt(new Date(end.getFullYear(), 11, 31)) };
    case "ytd":       return { from: fmt(new Date(end.getFullYear(), 0, 1)), to: fmt(end) };
    default:          return null;
  }
}

export default relativeRange;
