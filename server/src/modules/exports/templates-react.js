/**
 * templates-react.js — pembuat isi file untuk bundel Export-to-Script format
 * REACT (Vite). Sama filosofinya dengan templates.js (HTML/PHP): semua
 * fungsi di sini HANYA menghasilkan STRING (isi file), data disuntikkan lewat
 * JSON.stringify oleh exports.service.js — tidak menyentuh database di sini.
 *
 * DUA MODE (lihat exports.service.js assembleReact):
 *   - "hardcode" : data snapshot dibakar langsung ke src/data/snapshot.js.
 *                  `npm install && npm run dev` langsung jalan, tanpa server.
 *   - "db"       : src/data/snapshot.js TIDAK dipakai — App.jsx fetch ke
 *                  mini-backend Node/Express yang ikut disertakan di folder
 *                  server/ (mysql2, query SQL yang sama seperti mode PHP
 *                  live). User isi kredensial di server/.env sendiri.
 *                  Dipilih user lewat AskUserQuestion: paket harus BERDIRI
 *                  SENDIRI (standalone), bukan menempel ke API DARA yang
 *                  sedang berjalan.
 *
 * Chart di-render dengan ECharts (paket npm asli, BUKAN CDN) via komponen
 * EChart.jsx — port langsung dari client/src/components/EChart.jsx milik
 * DARA sendiri, supaya perilakunya familiar bagi developer yang sudah kenal
 * kode DARA. Logika buildOption() adalah port dari renderJs() di
 * templates.js (SATU-SATUNYA tempat lain aturan tampilan chart per tipe
 * didefinisikan) — kalau menambah tipe chart baru, update DUA tempat itu.
 */

/* ============================================================
 * package.json (root — app React/Vite)
 * ============================================================ */
export function reactPackageJson(slug) {
  return JSON.stringify({
    name: `dara-${slug}-react`,
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      echarts: "^5.5.0",
    },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.1",
      vite: "^5.4.0",
    },
  }, null, 2) + "\n";
}

export function reactViteConfig() {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// vite.config.js — HOW TO USE: default sudah cukup untuk \`npm run dev\`.
// SETTINGS: ubah "port" kalau 5173 bentrok dengan aplikasi lain di komputer Anda.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
`;
}

export function reactIndexHtml(meta) {
  return `<!doctype html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escHtml(meta.title || "Dashboard")}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`;
}

export function reactMainJsx() {
  return `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`;
}

/** src/data/meta.js — metadata + LAYOUT (sama isinya utk kedua mode data). */
export function reactMetaJs(meta) {
  return `/**
 * meta.js — metadata + layout dashboard/story (BUKAN data chart).
 * HOW TO USE: diimpor App.jsx, jarang perlu diubah manual kecuali ganti
 * judul/subjudul/tema di luar DARA.
 */
export const META = ${JSON.stringify(meta, null, 2)};

export default META;
`;
}

/** src/data/snapshot.js — HANYA untuk mode "hardcode". */
export function reactSnapshotJs(rowsById) {
  return `/**
 * snapshot.js — DATA HARDCODE hasil ekspor (mode "hardcode": contoh,
 * dibatasi ≤ 1000 baris per chart, dibakar langsung ke dalam kode).
 *
 * HOW TO USE
 *   Diimpor App.jsx. Untuk data live dari database, gunakan hasil ekspor
 *   React mode "DB" (menyertakan mini-backend Node) alih-alih mengedit file
 *   ini manual.
 *
 * Bentuk: { "<itemId>": [ { d1, d2?, v1, v2? }, ... ] }
 */
export const ROWS = ${JSON.stringify(rowsById, null, 2)};

export default ROWS;
`;
}

/** src/lib/format.js — port fmt() dari templates.js (angka: currency/percent/compact). */
export function reactFormatJs() {
  return `/**
 * format.js — format angka untuk kartu KPI/tabel/tooltip chart.
 * Port 1:1 dari fungsi fmt() di server/src/modules/exports/templates.js
 * (dipakai bundel HTML/PHP) — SENGAJA disamakan supaya angka tampil
 * identik lintas format ekspor.
 */
export function fmt(v, kind) {
  if (v == null || v === "" || isNaN(Number(v))) return v == null ? "-" : v;
  const n = Number(v);
  switch (kind) {
    case "currency": return "Rp " + n.toLocaleString("id-ID");
    case "percent": return n.toLocaleString("id-ID") + "%";
    case "compact":
      if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + " M";
      if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + " jt";
      if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + " rb";
      return String(n);
    case "thousands":
    default: return n.toLocaleString("id-ID");
  }
}

export default fmt;
`;
}

/** src/lib/buildOption.js — port buildOption() dari templates.js (ES module). */
export function reactBuildOptionJs() {
  return `/**
 * buildOption.js — bangun opsi ECharts dari spec chart + rows.
 *
 * Port 1:1 dari fungsi buildOption() di
 * server/src/modules/exports/templates.js (dipakai bundel HTML/PHP) —
 * SENGAJA disamakan supaya tampilan chart identik lintas format ekspor.
 * Kalau menambah tipe chart baru di DARA, update DUA tempat ini.
 *
 * @param {object} spec  { chartType, measures, format }
 * @param {Array}  rows  [{ d1, d2?, v1, v2? }, ...]
 * @param {string[]} palette  warna tema (lihat data/meta.js -> META.palette)
 */
import { fmt } from "./format.js";

function meaNames(spec) {
  const m = spec.measures || [];
  return m.length ? m : ["nilai"];
}

export function buildOption(spec, rows, palette) {
  const type = spec.chartType || "bar";
  const names = meaNames(spec);
  const grid = { left: 48, right: 16, top: 36, bottom: 40 };

  function axis(seriesType, extra) {
    const series = names.map((n, i) => ({
      name: n, type: seriesType,
      data: rows.map((r) => r["v" + (i + 1)]),
      ...(extra || {}),
    }));
    return {
      color: palette, tooltip: { trigger: "axis" }, grid,
      legend: names.length > 1 ? { top: 0 } : undefined,
      xAxis: { type: "category", data: rows.map((r) => String(r.d1)), axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { fontSize: 10 } },
      series,
    };
  }

  let opt;
  if (type === "bar") opt = axis("bar");
  else if (type === "line") opt = axis("line", { smooth: true });
  else if (type === "area") opt = axis("line", { smooth: true, areaStyle: {} });
  else if (type === "hbar") {
    opt = {
      color: palette, tooltip: { trigger: "axis" },
      grid: { left: 110, right: 16, top: 16, bottom: 30 },
      xAxis: { type: "value", axisLabel: { fontSize: 10 } },
      yAxis: { type: "category", data: rows.map((r) => String(r.d1)).reverse(), axisLabel: { fontSize: 10 } },
      series: [{ name: names[0], type: "bar", data: rows.map((r) => r.v1).reverse() }],
    };
  } else if (type === "pie" || type === "donut") {
    opt = {
      color: palette, tooltip: { trigger: "item" },
      series: [{
        type: "pie", radius: type === "donut" ? ["45%", "70%"] : "70%",
        data: rows.map((r) => ({ name: String(r.d1), value: r.v1 })),
        label: { fontSize: 10 },
      }],
    };
  } else if (type === "stackedbar") {
    const xs = [], subs = [];
    rows.forEach((r) => {
      if (!xs.includes(String(r.d1))) xs.push(String(r.d1));
      if (!subs.includes(String(r.d2))) subs.push(String(r.d2));
    });
    const series = subs.map((s) => ({
      name: s, type: "bar", stack: "total",
      data: xs.map((x) => {
        const f = rows.find((r) => String(r.d1) === x && String(r.d2) === s);
        return f ? f.v1 : 0;
      }),
    }));
    opt = {
      color: palette, tooltip: { trigger: "axis" }, legend: { top: 0, type: "scroll" }, grid,
      xAxis: { type: "category", data: xs, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { fontSize: 10 } },
      series,
    };
  } else if (type === "scatter") {
    opt = {
      color: palette, tooltip: { trigger: "item" }, grid,
      xAxis: { type: "value", name: names[0], axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", name: names[1] || "", axisLabel: { fontSize: 10 } },
      series: [{
        type: "scatter", symbolSize: 12,
        data: rows.map((r) => [r.v1, r.v2, r.d1 != null ? String(r.d1) : ""]),
      }],
    };
  } else if (type === "funnel") {
    opt = {
      color: palette, tooltip: { trigger: "item" },
      series: [{
        type: "funnel", sort: "descending", label: { fontSize: 10 },
        data: rows.map((r) => ({ name: String(r.d1), value: r.v1 })),
      }],
    };
  } else if (type === "radar") {
    const indicator = rows.map((r) => ({ name: String(r.d1), max: undefined }));
    opt = {
      color: palette, tooltip: {},
      radar: { indicator, axisLabel: { fontSize: 10 } },
      series: names.map((n, i) => ({
        type: "radar", name: n,
        data: [{ value: rows.map((r) => r["v" + (i + 1)]), name: n }],
      })),
    };
  } else {
    opt = axis("bar"); // fallback
  }

  if (spec.format) {
    if (opt.yAxis && !Array.isArray(opt.yAxis)) {
      opt.yAxis = { ...opt.yAxis, axisLabel: { ...opt.yAxis.axisLabel, formatter: (v) => fmt(v, spec.format) } };
    }
    opt.tooltip = { ...opt.tooltip, valueFormatter: (v) => fmt(v, spec.format) };
  }
  return opt;
}

export default buildOption;
`;
}

/** src/components/EChart.jsx — port persis dari client/src/components/EChart.jsx DARA. */
export function reactEChartJsx() {
  return `import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/**
 * EChart — wrapper React untuk Apache ECharts.
 * Port 1:1 dari client/src/components/EChart.jsx (aplikasi DARA sendiri) —
 * dipakai supaya perilaku resize/render identik dengan yang Anda lihat di
 * dalam DARA.
 */
export default function EChart({ option, height = "100%" }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);
    const ro = new ResizeObserver(() => {
      if (chartRef.current) chartRef.current.resize();
    });
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chartRef.current && chartRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true);
    }
  }, [option]);

  return (
    <div ref={ref} style={{ width: "100%", height, minHeight: 120 }} />
  );
}
`;
}

/** src/components/ChartCard.jsx — satu kartu (judul + isi sesuai chartType). */
export function reactChartCardJsx() {
  return `import EChart from "./EChart.jsx";
import { buildOption } from "../lib/buildOption.js";
import { fmt } from "../lib/format.js";

/**
 * ChartCard — satu kartu dashboard: judul + isi sesuai tipe.
 *   - "metric"        -> angka besar (KPI)
 *   - "table"/"pivot" -> <table> HTML biasa (bukan ECharts)
 *   - "map"           -> catatan (peta/Leaflet TIDAK ikut diekspor)
 *   - lainnya         -> ECharts (lihat lib/buildOption.js)
 */
function TableView({ spec, rows }) {
  if (!rows.length) return <div className="dara-note">Tidak ada data.</div>;
  const dims = spec.dimensions || [], meas = spec.measures || [];
  if (spec.chartType === "pivot") {
    const rks = [], cks = [], map = {};
    rows.forEach((r) => {
      const a = r.d1 == null ? "—" : String(r.d1);
      const b = r.d2 == null ? "—" : String(r.d2);
      if (!rks.includes(a)) rks.push(a);
      if (!cks.includes(b)) cks.push(b);
      map[a + "||" + b] = r.v1;
    });
    return (
      <table className="dara-table">
        <thead><tr>
          <th>{(dims[0] || "")} \\ {(dims[1] || "")}</th>
          {cks.map((c) => <th key={c} className="num">{c}</th>)}
        </tr></thead>
        <tbody>
          {rks.map((rk) => (
            <tr key={rk}>
              <th>{rk}</th>
              {cks.map((ck) => {
                const v = map[rk + "||" + ck];
                return <td key={ck} className="num">{v == null ? "" : fmt(v, spec.format)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  const hasD2 = rows.some((r) => r.d2 != null);
  const hasV2 = rows.some((r) => r.v2 != null);
  return (
    <table className="dara-table">
      <thead><tr>
        <th>{dims[0] || "Kategori"}</th>
        {hasD2 && <th>{dims[1] || "Sub"}</th>}
        <th className="num">{meas[0] || "Jumlah"}</th>
        {hasV2 && <th className="num">{meas[1] || "Nilai 2"}</th>}
      </tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.d1 == null ? "—" : String(r.d1)}</td>
            {hasD2 && <td>{r.d2 == null ? "—" : String(r.d2)}</td>}
            <td className="num">{fmt(r.v1, spec.format)}</td>
            {hasV2 && <td className="num">{fmt(r.v2, spec.format)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ChartCard({ chart, rows, palette }) {
  const spec = chart;
  const list = rows || [];

  let body;
  if (spec.chartType === "map") {
    body = <div className="dara-note">Peta (Leaflet) tidak ikut diekspor. Render manual bila diperlukan.</div>;
  } else if (spec.chartType === "metric") {
    const val = list[0] ? list[0].v1 : null;
    body = <div className="dara-metric">{val == null ? "-" : fmt(val, spec.format)}</div>;
  } else if (spec.chartType === "table" || spec.chartType === "pivot") {
    body = <TableView spec={spec} rows={list} />;
  } else if (!list.length) {
    body = <div className="dara-note">Tidak ada data.</div>;
  } else {
    body = <EChart option={buildOption(spec, list, palette)} />;
  }

  return (
    <div className="dara-card">
      <div className="dara-card-title">{spec.title || ""}</div>
      <div className="dara-card-body">{body}</div>
    </div>
  );
}
`;
}

/** src/components/DashboardGrid.jsx — grid 12-kolom (sama aturan dgn render.js). */
export function reactDashboardGridJsx() {
  return `import ChartCard from "./ChartCard.jsx";

const ROW_H = 40;

/** Satu "step" (dashboard biasa = 1 step; story = beberapa step). */
export default function DashboardGrid({ step, rowsById, palette }) {
  const items = step.items || [];
  let maxRow = 8;
  items.forEach((it) => { maxRow = Math.max(maxRow, (it.y || 0) + (it.h || 8)); });

  return (
    <div className="dara-step">
      {step.title && <h2 className="dara-step-title">{step.title}</h2>}
      {step.narasi && <p className="dara-narasi">{step.narasi}</p>}
      <div className="dara-grid" style={{ height: maxRow * ROW_H }}>
        {items.map((it) => {
          const cellStyle = {
            left: (it.x / 12) * 100 + "%",
            width: (it.w / 12) * 100 + "%",
            top: (it.y || 0) * ROW_H,
            height: (it.h || 8) * ROW_H,
          };
          return (
            <div key={it.id} className="dara-cell" style={cellStyle}>
              {it.kind === "text" ? (
                <div className="dara-card dara-text"><span>{it.text || ""}</span></div>
              ) : it.chart ? (
                <ChartCard chart={it.chart} rows={rowsById[it.id] || []} palette={palette} />
              ) : (
                <div className="dara-card"><div className="dara-note">Item tidak dikenal</div></div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
`;
}

/** src/App.jsx — mode "hardcode": import snapshot.js langsung. */
export function reactAppJsxHardcode() {
  return `import META from "./data/meta.js";
import ROWS from "./data/snapshot.js";
import DashboardGrid from "./components/DashboardGrid.jsx";

/**
 * App.jsx (mode HARDCODE) — data dibakar langsung dari data/snapshot.js,
 * tidak fetch kemana-mana. \`npm install && npm run dev\` langsung jalan.
 *
 * Untuk data LIVE dari database, ekspor ulang dari DARA dengan memilih
 * mode "React (DB)" — hasilnya menyertakan mini-backend Node terpisah.
 */
export default function App() {
  return (
    <div id="dara-root">
      <div className="dara-head">
        {META.logo && <span className="dara-logo">{META.logo}</span>}
        <div>
          <h1 className="dara-title">{META.title || "Dashboard"}</h1>
          {META.subtitle && <p className="dara-subtitle">{META.subtitle}</p>}
        </div>
      </div>
      {(META.steps || []).map((step, i) => (
        <DashboardGrid key={i} step={step} rowsById={ROWS} palette={META.palette} />
      ))}
      <div className="dara-foot">
        Dibuat oleh {META.generator || "DARA"} · data hardcode (snapshot, dibatasi).
      </div>
    </div>
  );
}
`;
}

/** src/App.jsx — mode "db": fetch tiap chart ke mini-backend Node sendiri. */
export function reactAppJsxDb() {
  return `import { useEffect, useState } from "react";
import META from "./data/meta.js";
import DashboardGrid from "./components/DashboardGrid.jsx";

// SETTING: alamat mini-backend Node (folder server/ di paket ini). Ubah
// lewat file .env (\`VITE_API_BASE_URL=...\`) — lihat README.md.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

/** Kumpulkan semua itemId chart dari seluruh step (dashboard/story). */
function collectChartIds(meta) {
  const ids = [];
  (meta.steps || []).forEach((step) => {
    (step.items || []).forEach((it) => { if (it.kind === "chart") ids.push(it.id); });
  });
  return ids;
}

/**
 * App.jsx (mode DB) — TIDAK ada data hardcode. Tiap chart di-fetch dari
 * mini-backend Node/Express (folder server/ di paket ini) yang menjalankan
 * SQL live ke database DARA Anda. Jalankan backend-nya dulu (lihat
 * server/README.md), baru \`npm run dev\` di folder ini.
 */
export default function App() {
  const [rowsById, setRowsById] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const ids = collectChartIds(META);
    Promise.all(
      ids.map((id) =>
        fetch(\`\${API_BASE}/api/chart/\${encodeURIComponent(id)}\`)
          .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
          .then((j) => [id, j.data || []])
          .catch((e) => { console.error("Gagal ambil data chart", id, e); return [id, []]; })
      )
    ).then((pairs) => {
      if (cancelled) return;
      setRowsById(Object.fromEntries(pairs));
      setLoading(false);
    }).catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <div id="dara-root">
      <div className="dara-head">
        {META.logo && <span className="dara-logo">{META.logo}</span>}
        <div>
          <h1 className="dara-title">{META.title || "Dashboard"}</h1>
          {META.subtitle && <p className="dara-subtitle">{META.subtitle}</p>}
        </div>
      </div>

      {loading && <div className="dara-note">Memuat data dari {API_BASE}…</div>}
      {error && (
        <div className="dara-note" style={{ color: "#dc2626" }}>
          Gagal terhubung ke backend ({API_BASE}). Pastikan sudah dijalankan — lihat server/README.md. Detail: {error}
        </div>
      )}

      {!loading && (META.steps || []).map((step, i) => (
        <DashboardGrid key={i} step={step} rowsById={rowsById} palette={META.palette} />
      ))}

      <div className="dara-foot">
        Dibuat oleh {META.generator || "DARA"} · data LIVE dari database (via {API_BASE}).
      </div>
    </div>
  );
}
`;
}

/** src/index.css — port persis dari stylesCss() di templates.js. */
export function reactIndexCss() {
  return `/* index.css — tata letak dashboard/story ekspor DARA (React).
   Port 1:1 dari server/src/modules/exports/templates.js -> stylesCss()
   supaya tampilan identik dengan bundel HTML/PHP. */
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: #f1f5f9; color: #0f172a; }
#dara-root { max-width: 1400px; margin: 0 auto; padding: 24px; border-radius: 16px; }
.dara-head { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.dara-logo { font-size: 32px; }
.dara-title { font-size: 26px; font-weight: 700; margin: 0; }
.dara-subtitle { color: #64748b; margin: 2px 0 0; font-size: 14px; }
.dara-step { margin-bottom: 28px; }
.dara-step-title { font-size: 18px; font-weight: 700; margin: 8px 0; }
.dara-narasi { color: #475569; font-size: 14px; line-height: 1.5; margin: 0 0 12px; white-space: pre-line; }
.dara-grid { position: relative; width: 100%; }
.dara-cell { position: absolute; padding: 6px; }
.dara-card { height: 100%; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0,0,0,.05); padding: 12px; display: flex; flex-direction: column; overflow: hidden; }
.dara-card-title { font-size: 13px; font-weight: 600; color: #0f172a; margin-bottom: 6px; flex-shrink: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dara-card-body { flex: 1; min-height: 0; }
.dara-text { justify-content: center; }
.dara-text span { font-size: 18px; font-weight: 700; }
.dara-metric { font-size: 34px; font-weight: 800; color: #0ea5e9; display: flex; align-items: center; height: 100%; }
.dara-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dara-table th, .dara-table td { padding: 6px 10px; border-bottom: 1px solid #eef2f7; text-align: left; }
.dara-table thead th { background: #f8fafc; color: #475569; font-weight: 600; position: sticky; top: 0; }
.dara-table td.num, .dara-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
.dara-note { color: #94a3b8; font-size: 13px; text-align: center; padding: 20px 8px; }
.dara-foot { color: #94a3b8; font-size: 11px; text-align: center; margin-top: 8px; }
`;
}

/* ============================================================
 * server/ — mini-backend Node (HANYA mode "db")
 * ============================================================ */
export function reactServerPackageJson(slug) {
  return JSON.stringify({
    name: `dara-${slug}-react-server`,
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: { start: "node server.js" },
    dependencies: {
      express: "^4.19.2",
      cors: "^2.8.5",
      mysql2: "^3.11.0",
      dotenv: "^16.4.5",
    },
  }, null, 2) + "\n";
}

export function reactServerEnvExample() {
  return `# server/.env — SALIN ke ".env" (JANGAN commit .env asli ke git publik)
# lalu isi kredensial database DARA Anda.
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=dara_free
# Port mini-backend ini sendiri (harus sama dengan VITE_API_BASE_URL di root .env)
PORT=4000
# Origin React dev server yang diizinkan CORS (Vite default 5173)
CORS_ORIGIN=http://localhost:5173
`;
}

export function reactServerDbJs() {
  return `import mysql from "mysql2/promise";
import "dotenv/config";

/**
 * db.js — koneksi MySQL untuk mini-backend export React (mode DB).
 * HOW TO USE: baca kredensial dari .env (lihat .env.example). Kolom SQL
 * WAJIB pakai alias d1,d2,v1,v2 (dijaga otomatis oleh queries.js — jangan
 * diubah manual kecuali Anda tahu render React-nya bergantung pada nama itu).
 */
export const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "",
  waitForConnections: true,
  connectionLimit: 5,
});

export default pool;
`;
}

/** server/queries.js — {id: sql}, dari sqlById yang sama dgn mode PHP live. */
export function reactServerQueriesJs(sqlById) {
  return `/**
 * queries.js — SQL agregasi per chart (SATU-SATUNYA sumber query di
 * backend ini). SQL ini dibuat otomatis dari definisi chart di DARA saat
 * ekspor — sesuaikan bila nama tabel/skema di database Anda berbeda, atau
 * tambah klausa WHERE untuk filter tambahan.
 *
 * PENTING: alias kolom d1,d2,v1,v2 WAJIB dipertahankan — dipakai langsung
 * oleh src/lib/buildOption.js di sisi React.
 */
export const QUERIES = ${JSON.stringify(sqlById, null, 2)};

export default QUERIES;
`;
}

export function reactServerJs() {
  return `import express from "express";
import cors from "cors";
import "dotenv/config";
import { pool } from "./db.js";
import { QUERIES } from "./queries.js";

/**
 * server.js — mini-backend Express untuk paket export React mode "DB".
 *
 * HOW TO USE
 *   1. cd server && npm install
 *   2. cp .env.example .env   (lalu isi kredensial database Anda)
 *   3. npm start               (default http://localhost:4000)
 *   4. Di folder root paket (bukan server/), jalankan \`npm run dev\` —
 *      App.jsx akan fetch ke sini otomatis (lihat VITE_API_BASE_URL).
 *
 * Satu endpoint saja: GET /api/chart/:id -> { data: [{d1,d2,v1,v2}, ...] }
 */
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));

app.get("/api/chart/:id", async (req, res) => {
  const sql = QUERIES[req.params.id];
  if (!sql) return res.json({ data: [] });
  try {
    const [rows] = await pool.query(sql);
    res.json({ data: rows });
  } catch (e) {
    console.error("Query gagal (" + req.params.id + "):", e.message);
    res.status(500).json({ error: "Query database gagal", detail: e.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log("DARA export backend (React/DB) jalan di http://localhost:" + PORT));
`;
}

export function reactServerReadme() {
  return `# Mini-backend Node — paket export React (mode DB)

Backend Express KECIL, HANYA untuk melayani data chart ke aplikasi React di
folder induk (\`../\`). Bukan aplikasi lengkap — cuma satu endpoint.

## Cara menjalankan
\`\`\`bash
cd server
npm install
cp .env.example .env
# edit .env: isi DB_HOST, DB_USER, DB_PASSWORD, DB_NAME sesuai database DARA Anda
npm start
\`\`\`
Default jalan di **http://localhost:4000**. Cek hidup: buka
http://localhost:4000/api/health (harus balas \`{"status":"ok"}\`).

## Struktur
- \`server.js\` — Express app, satu endpoint \`GET /api/chart/:id\`.
- \`db.js\` — koneksi MySQL (mysql2), baca kredensial dari \`.env\`.
- \`queries.js\` — SQL per chart (alias kolom d1/d2/v1/v2 WAJIB dipertahankan).
- \`.env.example\` — salin ke \`.env\`, JANGAN commit \`.env\` asli.

## Kalau nama tabel/kolom di database Anda beda
Edit langsung SQL di \`queries.js\` per id chart — tidak perlu ubah \`server.js\`.
`;
}

export function reactReadme(meta, generator, mode) {
  const dbBlock = mode === "db" ? `
## 2. Jalankan mini-backend (WAJIB untuk mode DB)
Paket ini TIDAK punya data hardcode — datanya di-fetch live dari database
DARA Anda lewat mini-backend Node kecil di folder \`server/\`:
\`\`\`bash
cd server
npm install
cp .env.example .env    # isi kredensial database Anda
npm start                # jalan di http://localhost:4000
\`\`\`

## 3. Jalankan aplikasi React (folder ini)
\`\`\`bash
npm install
npm run dev               # buka URL yang ditampilkan (default :5173)
\`\`\`
React akan fetch ke \`http://localhost:4000\` secara default — ubah lewat
\`.env\` di folder ini (\`VITE_API_BASE_URL=...\`) kalau backend dijalankan di
alamat/port lain.
` : `
## 2. Jalankan aplikasi (data sudah dibakar di kode — tanpa server tambahan)
\`\`\`bash
npm install
npm run dev               # buka URL yang ditampilkan (default :5173)
\`\`\`
Data yang tampil adalah **snapshot contoh** (≤ 1000 baris per chart, lihat
\`src/data/snapshot.js\`) — dibakar saat proses ekspor, TIDAK terhubung ke
database mana pun. Untuk data LIVE, ekspor ulang dari DARA dan pilih mode
**"React (DB)"** alih-alih mode ini.
`;

  return `# ${meta.title || "Dashboard"} — Bundel ReactJS (mode ${mode === "db" ? "DB, standalone + mini-backend" : "hardcode"})

Dihasilkan oleh **${generator}** sebagai *template pengembangan terpisah* —
proyek React (Vite) sungguhan, bukan cuma HTML statis. Cocok jadi titik awal
kalau Anda ingin mengembangkan lebih lanjut di luar DARA (React murni, tanpa
ketergantungan ke aplikasi DARA yang sedang berjalan).

## 1. Struktur file
- \`package.json\`, \`vite.config.js\`, \`index.html\` — proyek Vite standar.
- \`src/main.jsx\`, \`src/App.jsx\` — entry & komponen utama.
- \`src/components/DashboardGrid.jsx\`, \`ChartCard.jsx\`, \`EChart.jsx\` — render grid + chart.
- \`src/lib/buildOption.js\`, \`format.js\` — logika ECharts & format angka (port dari DARA).
- \`src/data/meta.js\` — metadata + layout (SAMA di kedua mode).
${mode === "hardcode" ? "- `src/data/snapshot.js` — **data hardcode**, dibatasi ≤ 1000 baris per chart.\n" : "- `server/` — **mini-backend Node/Express** (mysql2) yang menjalankan query live ke database DARA Anda. Lihat `server/README.md`.\n"}
${dbBlock}
## Catatan
- Peta (Leaflet) tidak ikut diekspor — ditampilkan sebagai catatan kosong (sama seperti bundel HTML/PHP).
- Warna chart mengikuti tema dashboard saat diekspor (\`src/data/meta.js -> palette\`).
- Chart di-render dengan **ECharts** (paket npm asli, sudah di \`package.json\`) — bukan lewat CDN.
`;
}

/* ---------- util kecil ---------- */
function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
