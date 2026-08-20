/**
 * Exports Service — modul "Export-to-Script".
 *
 * Mengubah sebuah DASHBOARD atau STORY menjadi bundel .zip berisi TEMPLATE
 * PENGEMBANGAN TERPISAH yang bisa dijalankan di luar DARA:
 *   - format "html" : HTML + JS statis (buka index.html, tanpa server)
 *   - format "php"  : aplikasi PHP (snapshot + opsi query DB live)
 *
 * Prinsip (sesuai permintaan): hasil ekspor BUKAN aplikasi jadi. Data yang
 * disertakan hanya SNAPSHOT contoh (≤ ROWS_LIMIT baris per chart). Koneksi DB
 * & setelan agar berjalan mandiri harus dilakukan pengguna (didokumentasikan
 * di tiap file lewat blok HOW TO USE / SETTINGS).
 *
 * Alur: viewModel (metadata+layout) + snapshot(rows) + sqlPerChart
 *       -> template HTML/PHP -> zipSync -> Buffer .zip
 */

import { zipSync } from "../../lib/zip.js";
import { aggExpr, AGGS } from "../../lib/aggExpr.js";
import { suggestionsService } from "../suggestions/suggestions.service.js";
import { dashboardsService } from "../dashboards/dashboards.service.js";
import { storiesService } from "../stories/stories.service.js";
import {
  renderJs, stylesCss,
  htmlIndex, htmlConfigJs, htmlDataJs, htmlReadme,
  phpConfig, phpDb, phpQueries, phpIndex, phpReadme,
} from "./templates.js";
import {
  reactPackageJson, reactViteConfig, reactIndexHtml, reactMainJsx,
  reactMetaJs, reactSnapshotJs, reactFormatJs, reactBuildOptionJs,
  reactEChartJsx, reactChartCardJsx, reactDashboardGridJsx,
  reactAppJsxHardcode, reactAppJsxDb, reactIndexCss,
  reactServerPackageJson, reactServerEnvExample, reactServerDbJs,
  reactServerQueriesJs, reactServerJs, reactServerReadme, reactReadme,
} from "./templates-react.js";
import {
  ci3Controller, ci3Model, ci3Library, ci3Helper, ci3View, ci3Readme,
} from "./templates-ci3.js";
import {
  ci4Controller, ci4Model, ci4Library, ci4Helper, ci4View, ci4Readme,
} from "./templates-ci4.js";

const GENERATOR = "DARA — Dashboard & Reporting Generator";
const ROWS_LIMIT = 1000; // batas baris snapshot per chart (500–1000 disarankan)

// Palet tema (mirror client/src/charts/themes.js) agar warna ekspor senada.
const THEME_COLORS = {
  default: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"],
  ocean:   ["#0ea5e9", "#0369a1", "#22d3ee", "#0891b2", "#7dd3fc", "#155e75", "#38bdf8", "#075985"],
  sunset:  ["#f97316", "#ef4444", "#f59e0b", "#e11d48", "#fb923c", "#be123c", "#fbbf24", "#9f1239"],
  forest:  ["#16a34a", "#65a30d", "#0d9488", "#4d7c0f", "#34d399", "#166534", "#a3e635", "#115e59"],
  berry:   ["#8b5cf6", "#ec4899", "#6366f1", "#d946ef", "#a78bfa", "#be185d", "#c084fc", "#7c3aed"],
  mono:    ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#475569", "#1e293b", "#e2e8f0"],
  pastel:  ["#93c5fd", "#a7f3d0", "#fde68a", "#fca5a5", "#c4b5fd", "#f9a8d4", "#99f6e4", "#fdba74"],
  neon:    ["#22d3ee", "#a3e635", "#f472b6", "#facc15", "#818cf8", "#4ade80", "#fb7185", "#2dd4bf"],
};

/** Slug aman untuk nama folder/file di dalam zip. */
function slugify(name) {
  return String(name || "dashboard")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "dashboard";
}

/** Normalisasi dimensi/measure (dukung bentuk lama & baru). */
function normDims(chart) {
  return chart.dimensions || (chart.dimension ? [chart.dimension] : []);
}
function normMeasures(chart) {
  return chart.measures || (chart.measure ? [chart.measure] : []);
}

/** Spec chart ringkas untuk template (tanpa info sensitif). */
function chartSpec(chart) {
  return {
    chartType: chart.chartType || "bar",
    title: chart.name || "",
    dimensions: normDims(chart),
    measures: normMeasures(chart),
    aggregation: chart.aggregation || (normMeasures(chart).length ? "SUM" : "COUNT"),
    color: chart.color || null,
    format: chart.format || null,
  };
}

/** Bangun SQL agregasi untuk sebuah chart (titik awal mode live PHP). */
function chartSql(chart) {
  if (chart.chartType === "map") return null;
  const dims = normDims(chart);
  const measures = normMeasures(chart);
  const agg = AGGS.includes(chart.aggregation) ? chart.aggregation : (measures.length ? "SUM" : "COUNT");

  // SQL live-mode dijalankan di DB tujuan pengguna. Kita pakai dialek driver
  // yang sedang aktif — hasil ekspor jadi konsisten dengan yang dilihat di UI.
  const dbType = (process.env.DB_TYPE || "mysql").toLowerCase();
  const selDims = dims.map((d, i) => `${d} AS d${i + 1}`);
  const selMeas = measures.length
    ? measures.map((m, i) => `${aggExpr(agg, m, dbType)} AS v${i + 1}`)
    : ["COUNT(*) AS v1"];
  const grp = dims.length ? `\nGROUP BY ${dims.join(", ")}` : "";
  const ord = dims.length ? `\nORDER BY ${dims.map((_, i) => `d${i + 1}`).join(", ")}` : "";
  // Catatan: chart.table sudah berisi nama tabel lengkap (mis. dara_data_penerimaan).
  return `SELECT ${[...selDims, ...selMeas].join(", ")}\nFROM ${chart.table}${grp}${ord}`;
}

/** Ambil snapshot data teragregasi untuk sebuah chart (≤ ROWS_LIMIT). */
async function chartSnapshot(chart) {
  if (chart.chartType === "map") return [];
  const dims = normDims(chart);
  const measures = normMeasures(chart);
  try {
    const rows = await suggestionsService.getChartDataMulti(chart.table, {
      dims, measures,
      aggregation: chart.aggregation || (measures.length ? "SUM" : "COUNT"),
      chartType: chart.chartType || "bar",
      join: chart.join || null,
      filters: [],
      dateGrain: chart.dateGrain || null,
      topN: chart.topN || 0,
    });
    return Array.isArray(rows) ? rows.slice(0, ROWS_LIMIT) : [];
  } catch (e) {
    console.error("Snapshot chart gagal:", chart.id, e.message);
    return [];
  }
}

/** Ubah item dashboard -> item template + kumpulkan rows & sql. */
async function processItems(items, rowsById, sqlById) {
  const out = [];
  for (const it of items || []) {
    const base = { id: it.id, x: it.x, y: it.y, w: it.w, h: it.h };
    if (it.kind === "text" || (it.text && !it.chart)) {
      out.push({ ...base, kind: "text", text: it.text || "" });
      continue;
    }
    const chart = it.chart;
    if (!chart) { out.push({ ...base, kind: "text", text: "(chart tidak tersedia)" }); continue; }
    out.push({ ...base, kind: "chart", chart: chartSpec(chart) });
    rowsById[it.id] = await chartSnapshot(chart);
    const sql = chartSql(chart);
    if (sql) sqlById[it.id] = sql;
  }
  return out;
}

/**
 * Bangun view model lengkap (meta + rows + sql) untuk dashboard atau story.
 * @returns {Promise<{meta, rowsById, sqlById, slug}>}
 */
async function buildViewModel(kind, entity) {
  const rowsById = {};
  const sqlById = {};

  const theme = entity.theme || "default";
  const palette = THEME_COLORS[theme] || THEME_COLORS.default;

  let steps = [];
  let title = entity.name || "Dashboard";
  let subtitle = entity.subtitle || null;

  if (kind === "dashboard") {
    steps = [{
      title: null,
      narasi: null,
      items: await processItems(entity.items, rowsById, sqlById),
    }];
  } else {
    // story: tiap langkah = satu dashboard + narasi
    for (const st of entity.steps || []) {
      const dash = st.dashboard;
      steps.push({
        title: st.title || (dash && dash.name) || "",
        narasi: st.narasi || "",
        items: dash ? await processItems(dash.items, rowsById, sqlById) : [],
      });
    }
  }

  const meta = {
    generator: GENERATOR,
    kind,
    title,
    subtitle,
    logo: entity.logo || null,
    bgColor: entity.bgColor || null,
    theme,
    palette,
    steps,
  };
  return { meta, rowsById, sqlById, slug: slugify(title) };
}

/** Rakit daftar file bundel HTML+JS. */
function assembleHtml(meta, rowsById, slug) {
  const root = `dara-${slug}-html/`;
  return [
    { name: root + "index.html", data: htmlIndex(meta, GENERATOR) },
    { name: root + "config.js", data: htmlConfigJs(meta) },
    { name: root + "data.js", data: htmlDataJs(rowsById) },
    { name: root + "assets/render.js", data: renderJs() },
    { name: root + "assets/styles.css", data: stylesCss() },
    { name: root + "README.md", data: htmlReadme(meta, GENERATOR) },
  ];
}

/** Rakit daftar file bundel PHP. */
function assemblePhp(meta, rowsById, sqlById, slug) {
  const root = `dara-${slug}-php/`;
  return [
    { name: root + "index.php", data: phpIndex(GENERATOR) },
    { name: root + "config.php", data: phpConfig() },
    { name: root + "db.php", data: phpDb() },
    { name: root + "queries.php", data: phpQueries(sqlById) },
    { name: root + "data_snapshot.json", data: JSON.stringify(rowsById, null, 2) },
    { name: root + "dara_meta.json", data: JSON.stringify(meta, null, 2) },
    { name: root + "assets/render.js", data: renderJs() },
    { name: root + "assets/styles.css", data: stylesCss() },
    { name: root + "README.md", data: phpReadme(meta, GENERATOR) },
  ];
}

/**
 * Rakit daftar file bundel REACT (Vite). mode: "hardcode" | "db".
 * mode "db" menambah folder server/ (mini-backend Node/Express + mysql2) —
 * dipilih user karena paket ekspor harus berdiri sendiri (standalone),
 * bukan menempel ke API DARA yang sedang berjalan.
 */
function assembleReact(meta, rowsById, sqlById, slug, mode) {
  const root = `dara-${slug}-react/`;
  const files = [
    { name: root + "package.json", data: reactPackageJson(slug) },
    { name: root + "vite.config.js", data: reactViteConfig() },
    { name: root + "index.html", data: reactIndexHtml(meta) },
    { name: root + "src/main.jsx", data: reactMainJsx() },
    { name: root + "src/index.css", data: reactIndexCss() },
    { name: root + "src/data/meta.js", data: reactMetaJs(meta) },
    { name: root + "src/lib/format.js", data: reactFormatJs() },
    { name: root + "src/lib/buildOption.js", data: reactBuildOptionJs() },
    { name: root + "src/components/EChart.jsx", data: reactEChartJsx() },
    { name: root + "src/components/ChartCard.jsx", data: reactChartCardJsx() },
    { name: root + "src/components/DashboardGrid.jsx", data: reactDashboardGridJsx() },
    { name: root + "README.md", data: reactReadme(meta, GENERATOR, mode) },
  ];
  if (mode === "db") {
    files.push(
      { name: root + "src/App.jsx", data: reactAppJsxDb() },
      { name: root + ".env.example", data: "VITE_API_BASE_URL=http://localhost:4000\n" },
      { name: root + "server/package.json", data: reactServerPackageJson(slug) },
      { name: root + "server/.env.example", data: reactServerEnvExample() },
      { name: root + "server/db.js", data: reactServerDbJs() },
      { name: root + "server/queries.js", data: reactServerQueriesJs(sqlById) },
      { name: root + "server/server.js", data: reactServerJs() },
      { name: root + "server/README.md", data: reactServerReadme() },
    );
  } else {
    files.push(
      { name: root + "src/App.jsx", data: reactAppJsxHardcode() },
      { name: root + "src/data/snapshot.js", data: reactSnapshotJs(rowsById) },
    );
  }
  return files;
}

/**
 * Rakit daftar file bundel CODEIGNITER 3. mode: "hardcode" | "db".
 * BUKAN aplikasi CI3 lengkap — cuma potongan MVC+library+helper+public yang
 * user pindahkan manual (lihat README.md di dalam zip untuk peta tujuan
 * tiap file). Struktur folder di zip meniru struktur tujuan CI3 standar.
 */
function assembleCi3(meta, rowsById, sqlById, slug, mode) {
  const root = `dara-${slug}-ci3/`;
  const files = [
    { name: root + "application/controllers/Dara_dashboard.php", data: ci3Controller(mode) },
    { name: root + "application/libraries/Dara_chart.php", data: ci3Library(mode) },
    { name: root + "application/helpers/dara_helper.php", data: ci3Helper() },
    { name: root + "application/views/dara_dashboard/index.php", data: ci3View(GENERATOR) },
    { name: root + "application/data/dara_meta.json", data: JSON.stringify(meta, null, 2) },
    { name: root + "assets/dara/render.js", data: renderJs() },
    { name: root + "assets/dara/styles.css", data: stylesCss() },
    { name: root + "README.md", data: ci3Readme(meta, GENERATOR, mode) },
  ];
  if (mode === "db") {
    files.push({ name: root + "application/models/Dara_dashboard_model.php", data: ci3Model(sqlById) });
  } else {
    files.push({ name: root + "application/data/dara_snapshot.json", data: JSON.stringify(rowsById, null, 2) });
  }
  return files;
}

/**
 * Rakit daftar file bundel CODEIGNITER 4. mode: "hardcode" | "db".
 * BUKAN aplikasi CI4 lengkap — cuma potongan MVC+library+helper+public yang
 * user pindahkan manual (lihat README.md di dalam zip untuk peta tujuan
 * tiap file). BEDA dari CI3: namespace PSR-4 (App\Controllers, dst — TIDAK
 * perlu load manual) & asset publik masuk public/assets/ (webroot CI4),
 * BUKAN assets/ di root proyek — lihat catatan lengkap di templates-ci4.js.
 */
function assembleCi4(meta, rowsById, sqlById, slug, mode) {
  const root = `dara-${slug}-ci4/`;
  const files = [
    { name: root + "app/Controllers/DaraDashboard.php", data: ci4Controller(mode) },
    { name: root + "app/Libraries/DaraChart.php", data: ci4Library(mode) },
    { name: root + "app/Helpers/dara_helper.php", data: ci4Helper() },
    { name: root + "app/Views/dara_dashboard/index.php", data: ci4View(GENERATOR) },
    { name: root + "app/Data/dara_meta.json", data: JSON.stringify(meta, null, 2) },
    { name: root + "public/assets/dara/render.js", data: renderJs() },
    { name: root + "public/assets/dara/styles.css", data: stylesCss() },
    { name: root + "README.md", data: ci4Readme(meta, GENERATOR, mode) },
  ];
  if (mode === "db") {
    files.push({ name: root + "app/Models/DaraDashboardModel.php", data: ci4Model(sqlById) });
  } else {
    files.push({ name: root + "app/Data/dara_snapshot.json", data: JSON.stringify(rowsById, null, 2) });
  }
  return files;
}

const KNOWN_FORMATS = ["html", "php", "react", "ci3", "ci4"];

export const exportsService = {
  /**
   * Hasilkan bundel .zip untuk sebuah entity.
   * @param {"dashboard"|"story"} kind
   * @param {object} entity  dashboard(getWithCharts) / story(getWithDashboards)
   * @param {"html"|"php"|"react"|"ci3"|"ci4"} format
   * @param {"hardcode"|"db"} mode  HANYA dipakai format "react"/"ci3"/"ci4" —
   *   diabaikan untuk "html" (selalu snapshot) & "php" (mode datanya diatur
   *   user sendiri lewat config.php DATA_SOURCE, bukan lewat parameter ekspor).
   * @returns {Promise<{filename, buffer}>}
   */
  async buildZip(kind, entity, format, mode) {
    const fmt = KNOWN_FORMATS.includes(format) ? format : "html";
    const dataMode = mode === "db" ? "db" : "hardcode"; // default aman: hardcode (tidak perlu setelan DB)
    const { meta, rowsById, sqlById, slug } = await buildViewModel(kind, entity);

    let files;
    if (fmt === "php") files = assemblePhp(meta, rowsById, sqlById, slug);
    else if (fmt === "react") files = assembleReact(meta, rowsById, sqlById, slug, dataMode);
    else if (fmt === "ci3") files = assembleCi3(meta, rowsById, sqlById, slug, dataMode);
    else if (fmt === "ci4") files = assembleCi4(meta, rowsById, sqlById, slug, dataMode);
    else files = assembleHtml(meta, rowsById, slug);

    const buffer = zipSync(files);
    const suffix = (fmt === "react" || fmt === "ci3" || fmt === "ci4") ? `${fmt}-${dataMode}` : fmt;
    const filename = `dara-${slug}-${suffix}.zip`;
    return { filename, buffer };
  },

  /** Bungkus resolver dashboard (mengembalikan entity siap-ekspor atau null). */
  resolveDashboard(id) {
    return dashboardsService.getWithCharts(id);
  },

  /** Bungkus resolver story. */
  resolveStory(id) {
    return storiesService.getWithDashboards(id);
  },
};

export default exportsService;
