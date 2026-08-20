import { apiFetch } from "../api/http.js";
import { useEffect, useState } from "react";
import EChart from "./EChart";
import MapView from "./MapView";
import { buildOption } from "../charts/optionBuilders";
import { formatValue } from "../lib/format";
import { applyTableCalc } from "../lib/tableCalc";
import DataTableView from "./DataTableView";
import { ChartSkeleton, Spinner } from "./Loader";

/**
 * ChartPreview — render satu chart dari spesifikasi.
 * Chart biasa -> ECharts. Chart tipe "map" -> MapView (Leaflet).
 *
 * Props: table (nama tabel), suggestion (spec chart)
 */
export default function ChartPreview({
  table, suggestion, filters = [], height = 260, palette = null,
  onCross = null, crossActive = false,
}) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  // ---- PETA: render Leaflet, bukan ECharts ----
  if (suggestion.chartType === "map") {
    const fill = height === "fill";
    return (
      <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-4 ${fill ? "h-full flex flex-col" : ""}`}>
        <div className="mb-1 flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wide text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">peta</span>
          <h4 className="font-semibold text-gray-900 text-sm truncate">{suggestion.title || suggestion.name || ""}</h4>
        </div>
        <div className={fill ? "flex-1 min-h-0" : ""}>
          <MapView geo={suggestion.geo} filters={filters} height={fill ? "100%" : height} />
        </div>
      </div>
    );
  }

  // Normalisasi bentuk lama -> baru
  const dims = suggestion.dimensions || (suggestion.dimension ? [suggestion.dimension] : []);
  const measures = suggestion.measures || (suggestion.measure ? [suggestion.measure] : []);

  useEffect(() => {
    let alive = true;
    setRows(null); setError(null);

    const params = new URLSearchParams({
      dims: dims.join(","),
      measures: measures.join(","),
      aggregation: suggestion.aggregation || (measures.length ? "SUM" : "COUNT"),
      chartType: suggestion.chartType || "bar",
    });
    if (suggestion.join) {
      params.set("joinTable", suggestion.join.table);
      params.set("joinLocalKey", suggestion.join.localKey);
      params.set("joinLabel", suggestion.join.label);
      if (suggestion.join.targetKey) params.set("joinTargetKey", suggestion.join.targetKey);
    }
    // R2-4: hierarki waktu (grain) + top-N
    if (suggestion.dateGrain) params.set("dateGrain", suggestion.dateGrain);
    if (suggestion.topN) params.set("topN", String(suggestion.topN));
    // R2-5: calculated field (measure dari ekspresi)
    if (suggestion.calcMeasures?.length) params.set("calc", JSON.stringify(suggestion.calcMeasures));
    // Slicer global dashboard (hanya nilai yang dipilih)
    if (filters.length) params.set("filters", JSON.stringify(filters));

    apiFetch(`/api/databases/tables/${table}/chart-data-multi?${params}`)
      .then(async (r) => {
        // Parse aman: server bisa saja mati sesaat (restart) -> body kosong.
        const text = await r.text();
        try { return JSON.parse(text); }
        catch { throw new Error("Server tidak merespons — coba refresh."); }
      })
      .then((res) => {
        if (!alive) return;
        if (res.error) setError(res.error);
        else setRows(res.data);
      })
      .catch((e) => alive && setError(e.message));

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, JSON.stringify(suggestion), JSON.stringify(filters)]);

  // Kalkulasi tabel (post-agregasi): ubah v1 sebelum render. pct_of_total
  // memaksa format persen agar sumbu & tooltip konsisten.
  const calc = suggestion.tableCalc || null;
  const viewRows = applyTableCalc(rows, calc);
  const fmtKey = calc === "pct_of_total" ? "percent" : (suggestion.format || "number");
  const fmtFn = (v) => formatValue(v, fmtKey);
  const spec = { ...suggestion, dimensions: dims, measures, format: fmtKey, _fmt: fmtFn };
  const isTableLike = suggestion.chartType === "table" || suggestion.chartType === "pivot";
  const fill = height === "fill"; // mode dashboard: chart mengisi seluruh widget

  // Cross-filter: klik elemen -> kirim (kolom dimensi pertama, nilai kategori)
  // ke parent. Hanya untuk chart berbasis kategori (punya dims[0]).
  const clickHandler = (onCross && dims[0])
    ? (params) => {
        const value = params?.name;
        if (value != null && value !== "") onCross(dims[0], value);
      }
    : null;

  // ---- KPI / METRIC CARD: angka besar, bukan ECharts ----
  if (suggestion.chartType === "metric") {
    const val = viewRows && viewRows[0] ? viewRows[0].v1 : null;
    const accent = palette ? palette[0] : (suggestion.color || "#0ea5e9");
    return (
      <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col justify-center ${fill ? "h-full" : ""}`}
        style={{ borderTop: `3px solid ${accent}` }}>
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 truncate">
          {suggestion.title || suggestion.name || ""}
        </div>
        {error ? <p className="text-red-600 text-sm mt-2">{error}</p>
          : !rows ? <div className="mt-2"><Spinner /></div>
          : <div className="text-4xl font-black text-gray-900 mt-1 truncate" style={{ color: accent }}>
              {val == null ? "-" : fmtFn(val)}
            </div>}
        {measures[0] && !error && (
          <div className="text-[11px] text-gray-400 mt-1">
            {suggestion.aggregation || "SUM"} · {measures[0]}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-4 ${
      fill ? "h-full flex flex-col" : ""} ${
      crossActive ? "border-teal-500 ring-2 ring-teal-300" : "border-gray-200"}`}>
      <div className="mb-1 flex items-center gap-2 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wide text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
          {suggestion.chartType}
        </span>
        <h4 className="font-semibold text-gray-900 text-sm truncate">
          {suggestion.title || suggestion.name || ""}
        </h4>
        {crossActive && (
          <span className="text-[10px] text-teal-600 shrink-0" title="Sumber cross-filter">🔗</span>
        )}
      </div>
      {suggestion.reason && !fill && (
        <p className="text-xs text-gray-500 mb-3">{suggestion.reason}</p>
      )}

      {error && <p className="text-red-600 text-sm py-8 text-center">{error}</p>}
      {!error && !rows && (
        fill ? <div className="flex-1 min-h-0"><ChartSkeleton /></div> : <ChartSkeleton />
      )}
      {!error && rows && rows.length === 0 && (
        <p className="text-gray-400 text-sm py-8 text-center">Tidak ada data.</p>
      )}
      {!error && rows && rows.length > 0 && (
        isTableLike ? (
          <div className={fill ? "flex-1 min-h-0 overflow-auto" : "overflow-auto"}
            style={fill ? undefined : { maxHeight: height }}>
            <DataTableView chartType={suggestion.chartType} rows={viewRows} spec={spec} fmt={fmtFn} />
          </div>
        ) : fill ? (
          <div className="flex-1 min-h-0">
            <EChart option={buildOption(suggestion.chartType, viewRows, spec, palette)}
              height="100%" onClick={clickHandler} />
          </div>
        ) : (
          <EChart option={buildOption(suggestion.chartType, viewRows, spec, palette)}
            height={height} onClick={clickHandler} />
        )
      )}
    </div>
  );
}
