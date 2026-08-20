import { useEffect, useMemo, useState } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import EChart from "../components/EChart";
import { buildOption } from "../charts/optionBuilders";
import { getTheme } from "../charts/themes";
import { ChartSkeleton, LoadingBox } from "../components/Loader";

const Grid = WidthProvider(GridLayout);
const ROW_HEIGHT = 40;

function isDarkHex(hex) {
  if (!hex) return false;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

/**
 * EmbedViewer v0.10.0 — halaman publik /view/:id?key=...
 * Dipanggil MANDOR lewat iframe. TANPA login; keamanan lewat kunci embed.
 *
 * Filter awal bisa dikirim lewat URL (v0.21.0):
 *   select     : f_<kolom>=nilai
 *   multiselect : f_<kolom>=a,b,c  (dipisah koma)
 *   daterange   : f_<kolom>_from=YYYY-MM-DD & f_<kolom>_to=YYYY-MM-DD
 * contoh: /view/dash_123?key=abc&f_status=completed&f_tanggal_from=2024-01-01
 */
export default function EmbedViewer() {
  const id = window.location.pathname.split("/")[2] || "";
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const key = query.get("key") || "";

  const [dash, setDash] = useState(null);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});

  // Muat dashboard + prefill filter dari URL (f_<kolom>=nilai)
  useEffect(() => {
    fetch(`/api/embed/${id}?key=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then(async (res) => {
        if (res.error) { setError(res.error); return; }
        const d = res.data;
        setDash(d);

        // prefill dari URL (bentuk sesuai tipe slicer)
        const initial = {};
        for (const f of d.filters || []) {
          if (f.type === "daterange") {
            const from = query.get(`f_${f.column}_from`) ?? query.get(`f_${f.column.toLowerCase()}_from`);
            const to = query.get(`f_${f.column}_to`) ?? query.get(`f_${f.column.toLowerCase()}_to`);
            if (from || to) initial[f.id] = { from: from || "", to: to || "" };
          } else {
            const v = query.get(`f_${f.column}`) ?? query.get(`f_${f.column.toLowerCase()}`);
            if (v) initial[f.id] = f.type === "multiselect" ? v.split(",").filter(Boolean) : v;
          }
        }
        setActiveFilters(initial);
      })
      .catch(() => setError("Gagal memuat dashboard"));
  }, [id, key, query]);

  // Konversi nilai slicer -> bentuk backend (v0.21.0): value | values | from/to
  const backendFilters = useMemo(() => {
    if (!dash) return [];
    const out = [];
    for (const f of dash.filters || []) {
      const v = activeFilters[f.id];
      if (f.type === "multiselect") {
        if (Array.isArray(v) && v.length) out.push({ column: f.column, values: v });
      } else if (f.type === "daterange") {
        if (v?.from || v?.to) out.push({ column: f.column, from: v.from || undefined, to: v.to || undefined });
      } else if (v !== undefined && v !== "") {
        out.push({ column: f.column, value: v });
      }
    }
    return out;
  }, [dash, activeFilters]);

  // Opsi slicer CASCADING: dimuat ulang tiap filter berubah, dengan filter LAIN
  // yang aktif (server mengecualikan kolom slicer itu sendiri).
  useEffect(() => {
    if (!dash) return;
    let alive = true;
    (async () => {
      const opts = {};
      const fparam = encodeURIComponent(JSON.stringify(backendFilters));
      for (const f of dash.filters || []) {
        if (f.type === "daterange") continue;
        try {
          const r2 = await fetch(
            `/api/embed/${id}/distinct?key=${encodeURIComponent(key)}&filterId=${f.id}&filters=${fparam}`);
          const j2 = await r2.json();
          opts[f.id] = j2.data || [];
        } catch { opts[f.id] = []; }
      }
      if (alive) setFilterOptions(opts);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash, JSON.stringify(backendFilters)]);

  /** Render kontrol slicer sesuai tipe. */
  function renderSlicer(f) {
    const set = (v) => setActiveFilters((s) => ({ ...s, [f.id]: v }));
    const inp = "border border-gray-300 rounded-lg px-2 py-1 text-sm";

    if (f.type === "daterange") {
      const val = activeFilters[f.id] || {};
      return (
        <span className="flex items-center gap-1">
          <input type="date" className={inp} value={val.from || ""}
            onChange={(e) => set({ ...val, from: e.target.value })} />
          <span className="text-gray-400">–</span>
          <input type="date" className={inp} value={val.to || ""}
            onChange={(e) => set({ ...val, to: e.target.value })} />
        </span>
      );
    }
    if (f.type === "multiselect") {
      const sel = activeFilters[f.id] || [];
      const toggle = (v) => set(sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
      return (
        <span className="flex flex-wrap gap-1 max-w-md">
          {(filterOptions[f.id] || []).map((v) => {
            const on = sel.includes(v);
            return (
              <button key={String(v)} type="button" onClick={() => toggle(v)}
                className={`text-xs px-2 py-1 rounded-full border ${on
                  ? "bg-teal-600 border-teal-600 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-teal-400"}`}>
                {String(v)}
              </button>
            );
          })}
        </span>
      );
    }
    return (
      <select className={inp} value={activeFilters[f.id] ?? ""}
        onChange={(e) => set(e.target.value)}>
        <option value="">Semua</option>
        {(filterOptions[f.id] || []).map((v) => (
          <option key={String(v)} value={v}>{String(v)}</option>
        ))}
      </select>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <p className="text-gray-500">{error}</p>
      </div>
    );
  }
  if (!dash) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <LoadingBox message="Memuat dashboard…" />
      </div>
    );
  }

  const palette = getTheme(dash.theme).colors;
  const layout = dash.items.map((it) => ({
    i: it.id, x: it.x, y: it.y, w: it.w, h: it.h, static: true,
  }));

  const dark = isDarkHex(dash.bgColor);
  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: dash.bgColor || "#f1f5f9" }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3 mb-3">
          {dash.logo && <span className="text-3xl">{dash.logo}</span>}
          <div>
            <h1 className={`text-xl font-bold ${dark ? "text-white" : "text-gray-900"}`}>{dash.name}</h1>
            {dash.subtitle && (
              <p className={`text-sm ${dark ? "text-slate-300" : "text-gray-500"}`}>{dash.subtitle}</p>
            )}
          </div>
        </div>

        {(dash.filters || []).length > 0 && (
          <div className="flex flex-wrap gap-3 mb-3 bg-white rounded-xl border border-gray-200 p-3">
            {dash.filters.map((f) => (
              <div key={f.id} className="text-sm flex items-center gap-2">
                <span className="font-semibold text-gray-700 capitalize">{f.label}:</span>
                {renderSlicer(f)}
              </div>
            ))}
          </div>
        )}

        <Grid layout={layout} cols={12} rowHeight={ROW_HEIGHT}
          isDraggable={false} isResizable={false} compactType={null}>
          {dash.items.map((it) => (
            <div key={it.id}>
              {it.kind === "text" ? (
                <div className="h-full flex items-center px-4 bg-white rounded-xl border border-gray-200">
                  <span className="font-bold text-gray-800 text-lg truncate">{it.text}</span>
                </div>
              ) : it.chart ? (
                <EmbedChart dashId={id} embedKey={key} chart={it.chart}
                  filters={backendFilters} palette={palette} />
              ) : (
                <div className="p-3 text-xs text-red-400 bg-white rounded-xl border h-full">
                  Chart tidak tersedia
                </div>
              )}
            </div>
          ))}
        </Grid>

        <p className="text-[10px] text-gray-400 mt-2 text-right">DARA</p>
      </div>
    </div>
  );
}

/** Satu chart di embed: ambil data dari endpoint embed (tanpa token login). */
function EmbedChart({ dashId, embedKey, chart, filters, palette }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null); setErr(null);
    const params = new URLSearchParams({ key: embedKey });
    if (filters.length) params.set("filters", JSON.stringify(filters));
    fetch(`/api/embed/${dashId}/chart/${chart.id}/data?${params}`)
      .then((r) => r.json())
      .then((res) => {
        if (!alive) return;
        if (res.error) setErr(res.error); else setRows(res.data);
      })
      .catch(() => alive && setErr("Gagal memuat"));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashId, embedKey, chart.id, JSON.stringify(filters)]);

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm p-3">
      <h4 className="text-sm font-semibold text-gray-900 truncate shrink-0 mb-1">
        {chart.name}
      </h4>
      {err && <p className="text-red-500 text-xs py-6 text-center">{err}</p>}
      {!err && !rows && <ChartSkeleton />}
      {!err && rows && rows.length === 0 && (
        <p className="text-gray-400 text-xs py-6 text-center">Tidak ada data.</p>
      )}
      {!err && rows && rows.length > 0 && (
        <div className="flex-1 min-h-0">
          <EChart option={buildOption(chart.chartType, rows, chart, palette)} height="100%" />
        </div>
      )}
    </div>
  );
}
