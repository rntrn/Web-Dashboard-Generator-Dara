import { useMemo } from "react";
import { cellStyle, valueRange } from "../lib/condFormat";

/**
 * DataTableView — render chart tipe "table" & "pivot" sebagai HTML table.
 * Bukan ECharts (angka lebih terbaca dalam bentuk tabel). Mendukung
 * conditional formatting (spec.condFormat) via lib/condFormat.
 *
 * Props:
 *   chartType : "table" | "pivot"
 *   rows      : Array<{ d1, d2?, v1, v2? }>  (sudah teragregasi & ter-tableCalc)
 *   spec      : { dimensions[], measures[], condFormat, _fmt }
 *   fmt       : (v) => string  (format angka; default identitas)
 */
export default function DataTableView({ chartType, rows, spec, fmt }) {
  const fmtFn = fmt || spec?._fmt || ((v) => v);
  const dims = spec?.dimensions || [];
  const measures = spec?.measures || [];
  const cf = spec?.condFormat || null;

  if (chartType === "pivot") {
    return <PivotTable rows={rows} dims={dims} cf={cf} fmt={fmtFn} />;
  }
  return <FlatTable rows={rows} dims={dims} measures={measures} cf={cf} fmt={fmtFn} />;
}

/** Tabel datar: kolom dimensi + kolom measure (v1, v2). */
function FlatTable({ rows, dims, measures, cf, fmt }) {
  const hasD2 = rows.some((r) => r.d2 != null);
  const hasV2 = rows.some((r) => r.v2 != null);
  const measLabels = measures.length ? measures : ["Jumlah"];

  // Rentang per kolom measure untuk mode "scale".
  const range1 = useMemo(() => valueRange(rows.map((r) => r.v1)), [rows]);
  const range2 = useMemo(() => valueRange(rows.map((r) => r.v2)), [rows]);

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-gray-50">
          <tr className="text-left text-gray-600">
            <th className="px-3 py-2 font-semibold border-b border-gray-200">{dims[0] || "Kategori"}</th>
            {hasD2 && <th className="px-3 py-2 font-semibold border-b border-gray-200">{dims[1] || "Sub"}</th>}
            <th className="px-3 py-2 font-semibold border-b border-gray-200 text-right">{measLabels[0]}</th>
            {hasV2 && <th className="px-3 py-2 font-semibold border-b border-gray-200 text-right">{measLabels[1] || "Nilai 2"}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const s1 = cellStyle(r.v1, cf, range1);
            const s2 = hasV2 ? cellStyle(r.v2, cf, range2) : null;
            return (
              <tr key={i} className="odd:bg-white even:bg-gray-50/50">
                <td className="px-3 py-1.5 border-b border-gray-100 text-gray-800">{fmtLabel(r.d1)}</td>
                {hasD2 && <td className="px-3 py-1.5 border-b border-gray-100 text-gray-600">{fmtLabel(r.d2)}</td>}
                <td className="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums" style={s1 || undefined}>{fmt(r.v1)}</td>
                {hasV2 && <td className="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums" style={s2 || undefined}>{fmt(r.v2)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Pivot: d1 -> baris, d2 -> kolom, sel = v1. */
function PivotTable({ rows, dims, cf, fmt }) {
  const { rowKeys, colKeys, matrix, allVals } = useMemo(() => {
    const rk = [], ck = [], seenR = new Set(), seenC = new Set();
    const map = new Map(); // `${d1}||${d2}` -> v1
    const vals = [];
    for (const r of rows) {
      const a = fmtLabel(r.d1), b = fmtLabel(r.d2);
      if (!seenR.has(a)) { seenR.add(a); rk.push(a); }
      if (!seenC.has(b)) { seenC.add(b); ck.push(b); }
      map.set(`${a}||${b}`, r.v1);
      if (r.v1 != null) vals.push(r.v1);
    }
    return { rowKeys: rk, colKeys: ck, matrix: map, allVals: vals };
  }, [rows]);

  const range = useMemo(() => valueRange(allVals), [allVals]);

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-gray-50">
          <tr className="text-left text-gray-600">
            <th className="px-3 py-2 font-semibold border-b border-r border-gray-200">{dims[0] || ""} \ {dims[1] || ""}</th>
            {colKeys.map((c) => (
              <th key={c} className="px-3 py-2 font-semibold border-b border-gray-200 text-right whitespace-nowrap">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((rk) => (
            <tr key={rk} className="odd:bg-white even:bg-gray-50/50">
              <td className="px-3 py-1.5 border-b border-r border-gray-100 text-gray-800 font-medium whitespace-nowrap">{rk}</td>
              {colKeys.map((ck) => {
                const v = matrix.get(`${rk}||${ck}`);
                const s = v == null ? null : cellStyle(v, cf, range);
                return (
                  <td key={ck} className="px-3 py-1.5 border-b border-gray-100 text-right tabular-nums" style={s || undefined}>
                    {v == null ? "" : fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtLabel(v) {
  if (v == null || v === "") return "—";
  return String(v);
}
