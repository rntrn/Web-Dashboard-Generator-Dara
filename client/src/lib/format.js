/**
 * Format angka untuk chart & KPI card.
 * fmt: number | thousands | currency | percent | compact
 */
export function formatValue(v, fmt) {
  if (v == null || v === "" || (typeof v === "number" && !Number.isFinite(v))) return "-";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  switch (fmt) {
    case "thousands":
      return n.toLocaleString("id-ID");
    case "currency":
      return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 0 });
    case "percent":
      return n.toLocaleString("id-ID", { maximumFractionDigits: 1 }) + "%";
    case "compact":
      return compact(n);
    case "number":
    default:
      return n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
  }
}

/** Ringkas: 1.2 rb / 3,4 jt / 1,1 M (Indonesia). */
function compact(n) {
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(1).replace(".", ",") + " T";
  if (abs >= 1e9) return (n / 1e9).toFixed(1).replace(".", ",") + " M";
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(".", ",") + " jt";
  if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(".", ",") + " rb";
  return String(n);
}

export const FORMAT_OPTIONS = [
  { id: "", label: "Otomatis" },
  { id: "number", label: "Angka (1.234,5)" },
  { id: "thousands", label: "Ribuan (1.234)" },
  { id: "currency", label: "Rupiah (Rp 1.234)" },
  { id: "percent", label: "Persen (12,3%)" },
  { id: "compact", label: "Ringkas (1,2 jt)" },
];

export default formatValue;
