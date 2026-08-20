/**
 * templates.js — kumpulan pembuat isi file untuk bundel Export-to-Script.
 *
 * Semua fungsi di sini HANYA menghasilkan STRING (isi file). Data & metadata
 * disuntikkan oleh exports.service lewat JSON.stringify — templates tidak
 * menyentuh database.
 *
 * Dua target:
 *   - HTML+JS : jalan tanpa server (buka index.html). Data dari snapshot;
 *               opsi "api" bila mau tarik data live dari endpoint sendiri.
 *   - PHP     : jalan di server PHP. Snapshot sebagai fallback; mode "live"
 *               menjalankan query DB (koneksi WAJIB diisi di config.php).
 *
 * render.js & styles.css DIPAKAI BERSAMA kedua target (isi identik).
 */

/* ============================================================
 * 1) MESIN RENDER BERSAMA (browser, tanpa framework)
 * Membaca window.DARA (metadata+layout) & window.DARA_ROWS (data per item).
 * Ditulis dengan konkатenasi string (bukan template literal) agar aman
 * ditaruh di dalam file JS lain.
 * ============================================================ */
export function renderJs() {
  return `/**
 * render.js — mesin render dashboard/story hasil ekspor DARA.
 *
 * HOW TO USE
 *   File ini dipanggil terakhir oleh index.html / index.php. Ia membaca:
 *     window.DARA      -> metadata + layout (judul, langkah, item, spec chart)
 *     window.DARA_ROWS -> { "<itemId>": [ {d1,d2,v1,v2}, ... ] }  data per chart
 *   lalu menggambar grid + chart memakai ECharts (harus sudah dimuat global).
 *
 * SETTINGS
 *   - Warna mengikuti window.DARA.palette (dari tema dashboard).
 *   - Mode data diatur di window.DARA.runtime (lihat config.js pada bundel HTML).
 *   - Tidak perlu diubah untuk pemakaian biasa; ubah hanya bila mengganti
 *     cara render atau menambah tipe chart.
 */
(function () {
  "use strict";
  var META = window.DARA || {};
  var ROWS = window.DARA_ROWS || {};
  var PENDING = []; // chart yang menunggu dirender SETELAH DOM menempel
  var PALETTE = (META.palette && META.palette.length) ? META.palette
    : ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316"];
  var ROW_H = 40;

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c];
    });
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function fmt(v, kind) {
    if (v == null || v === "" || isNaN(Number(v))) return v == null ? "-" : v;
    var n = Number(v);
    switch (kind) {
      case "currency": return "Rp " + n.toLocaleString("id-ID");
      case "percent":  return n.toLocaleString("id-ID") + "%";
      case "compact":
        if (Math.abs(n) >= 1e9) return (n/1e9).toFixed(1) + " M";
        if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(1) + " jt";
        if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(1) + " rb";
        return String(n);
      case "thousands":
      default: return n.toLocaleString("id-ID");
    }
  }
  function meaNames(spec) { var m = spec.measures || []; return m.length ? m : ["nilai"]; }

  function buildOption(spec, rows) {
    var type = spec.chartType || "bar";
    var names = meaNames(spec);
    var grid = { left: 48, right: 16, top: 36, bottom: 40 };
    function axis(seriesType, extra) {
      var series = names.map(function (n, i) {
        var s = { name: n, type: seriesType, data: rows.map(function (r) { return r["v" + (i + 1)]; }) };
        if (extra) for (var k in extra) s[k] = extra[k];
        return s;
      });
      return { color: PALETTE, tooltip: { trigger: "axis" }, grid: grid,
        legend: names.length > 1 ? { top: 0 } : undefined,
        xAxis: { type: "category", data: rows.map(function (r) { return String(r.d1); }), axisLabel: { fontSize: 10 } },
        yAxis: { type: "value", axisLabel: { fontSize: 10 } }, series: series };
    }
    if (type === "bar")  return axis("bar");
    if (type === "line") return axis("line", { smooth: true });
    if (type === "area") return axis("line", { smooth: true, areaStyle: {} });
    if (type === "hbar") return { color: PALETTE, tooltip: { trigger: "axis" },
      grid: { left: 110, right: 16, top: 16, bottom: 30 },
      xAxis: { type: "value", axisLabel: { fontSize: 10 } },
      yAxis: { type: "category", data: rows.map(function (r) { return String(r.d1); }).reverse(), axisLabel: { fontSize: 10 } },
      series: [{ name: names[0], type: "bar", data: rows.map(function (r) { return r.v1; }).reverse() }] };
    if (type === "pie" || type === "donut") return { color: PALETTE, tooltip: { trigger: "item" },
      series: [{ type: "pie", radius: type === "donut" ? ["45%","70%"] : "70%",
        data: rows.map(function (r) { return { name: String(r.d1), value: r.v1 }; }), label: { fontSize: 10 } }] };
    if (type === "stackedbar") {
      var xs = [], subs = [];
      rows.forEach(function (r) {
        if (xs.indexOf(String(r.d1)) < 0) xs.push(String(r.d1));
        if (subs.indexOf(String(r.d2)) < 0) subs.push(String(r.d2));
      });
      var series = subs.map(function (s) {
        return { name: s, type: "bar", stack: "total",
          data: xs.map(function (x) {
            var f = rows.find(function (r) { return String(r.d1) === x && String(r.d2) === s; });
            return f ? f.v1 : 0;
          }) };
      });
      return { color: PALETTE, tooltip: { trigger: "axis" }, legend: { top: 0, type: "scroll" }, grid: grid,
        xAxis: { type: "category", data: xs, axisLabel: { fontSize: 10 } },
        yAxis: { type: "value", axisLabel: { fontSize: 10 } }, series: series };
    }
    if (type === "scatter") return { color: PALETTE, tooltip: { trigger: "item" }, grid: grid,
      xAxis: { type: "value", name: names[0], axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", name: names[1] || "", axisLabel: { fontSize: 10 } },
      series: [{ type: "scatter", symbolSize: 12,
        data: rows.map(function (r) { return [r.v1, r.v2, r.d1 != null ? String(r.d1) : ""]; }) }] };
    if (type === "funnel") return { color: PALETTE, tooltip: { trigger: "item" },
      series: [{ type: "funnel", sort: "descending", label: { fontSize: 10 },
        data: rows.map(function (r) { return { name: String(r.d1), value: r.v1 }; }) }] };
    return axis("bar"); // fallback
  }

  // ---- Tabel & Pivot + conditional formatting (R2-3) ----
  function cfBg(v, cf, min, max) {
    if (!cf || v == null || isNaN(Number(v))) return "";
    v = Number(v);
    if (cf.mode === "rules") {
      for (var i = 0; i < (cf.rules || []).length; i++) {
        var r = cf.rules[i], ok = false, a = Number(r.value);
        if (r.op === ">") ok = v > a; else if (r.op === ">=") ok = v >= a;
        else if (r.op === "<") ok = v < a; else if (r.op === "<=") ok = v <= a;
        else if (r.op === "=") ok = v === a;
        else if (r.op === "between") { var b = Number(r.value2); ok = v >= Math.min(a,b) && v <= Math.max(a,b); }
        if (ok) return "background:" + r.color + ";color:#fff;";
      }
      return "";
    }
    if (cf.mode === "scale") {
      var t = max > min ? (v - min) / (max - min) : 1; t = 0.15 + 0.85 * t;
      var base = cf.color || "#3b82f6";
      var n = parseInt(base.slice(1), 16), R = (n>>16)&255, G = (n>>8)&255, B = n&255;
      var mr = Math.round(255 + (R-255)*t), mg = Math.round(255 + (G-255)*t), mb = Math.round(255 + (B-255)*t);
      var lum = (0.299*mr + 0.587*mg + 0.114*mb) / 255;
      return "background:rgb(" + mr + "," + mg + "," + mb + ");color:" + (lum > 0.6 ? "#111" : "#fff") + ";";
    }
    return "";
  }
  function renderTable(spec, rows) {
    if (!rows.length) return '<div class="dara-note">Tidak ada data.</div>';
    var cf = spec.condFormat || null;
    var dims = spec.dimensions || [], meas = spec.measures || [];
    if (spec.chartType === "pivot") {
      var rks = [], cks = [], seenR = {}, seenC = {}, map = {}, vals = [];
      rows.forEach(function (r) {
        var a = r.d1 == null ? "—" : String(r.d1), b = r.d2 == null ? "—" : String(r.d2);
        if (!seenR[a]) { seenR[a] = 1; rks.push(a); }
        if (!seenC[b]) { seenC[b] = 1; cks.push(b); }
        map[a + "||" + b] = r.v1; if (r.v1 != null) vals.push(Number(r.v1));
      });
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
      var h = '<table class="dara-table"><thead><tr><th>' + escapeHtml((dims[0]||"") + " \\ " + (dims[1]||"")) + '</th>';
      cks.forEach(function (c) { h += '<th class="num">' + escapeHtml(c) + '</th>'; });
      h += '</tr></thead><tbody>';
      rks.forEach(function (rk) {
        h += '<tr><th>' + escapeHtml(rk) + '</th>';
        cks.forEach(function (ck) {
          var v = map[rk + "||" + ck];
          h += '<td class="num" style="' + cfBg(v, cf, mn, mx) + '">' + (v == null ? "" : escapeHtml(fmt(v, spec.format))) + '</td>';
        });
        h += '</tr>';
      });
      return h + '</tbody></table>';
    }
    // tabel datar
    var hasD2 = rows.some(function (r){ return r.d2 != null; });
    var hasV2 = rows.some(function (r){ return r.v2 != null; });
    var v1s = rows.map(function (r){ return Number(r.v1); }).filter(function (n){ return !isNaN(n); });
    var mn1 = Math.min.apply(null, v1s), mx1 = Math.max.apply(null, v1s);
    var t = '<table class="dara-table"><thead><tr><th>' + escapeHtml(dims[0]||"Kategori") + '</th>';
    if (hasD2) t += '<th>' + escapeHtml(dims[1]||"Sub") + '</th>';
    t += '<th class="num">' + escapeHtml(meas[0]||"Jumlah") + '</th>';
    if (hasV2) t += '<th class="num">' + escapeHtml(meas[1]||"Nilai 2") + '</th>';
    t += '</tr></thead><tbody>';
    rows.forEach(function (r) {
      t += '<tr><td>' + escapeHtml(r.d1 == null ? "—" : String(r.d1)) + '</td>';
      if (hasD2) t += '<td>' + escapeHtml(r.d2 == null ? "—" : String(r.d2)) + '</td>';
      t += '<td class="num" style="' + cfBg(r.v1, cf, mn1, mx1) + '">' + escapeHtml(fmt(r.v1, spec.format)) + '</td>';
      if (hasV2) t += '<td class="num">' + escapeHtml(fmt(r.v2, spec.format)) + '</td>';
      t += '</tr>';
    });
    return t + '</tbody></table>';
  }

  function renderChartInto(host, spec, rows) {
    if (spec.chartType === "map") {
      host.innerHTML = '<div class="dara-note">Peta (Leaflet) tidak ikut diekspor. Render manual bila diperlukan.</div>';
      return;
    }
    if (spec.chartType === "metric") {
      var val = (rows && rows[0]) ? rows[0].v1 : null;
      host.innerHTML = '<div class="dara-metric">' + (val == null ? "-" : escapeHtml(fmt(val, spec.format))) + '</div>';
      return;
    }
    if (spec.chartType === "table" || spec.chartType === "pivot") {
      host.innerHTML = renderTable(spec, rows || []);
      return;
    }
    if (!window.echarts) {
      host.innerHTML = '<div class="dara-note">ECharts belum dimuat. Cek koneksi CDN atau setelan di index.</div>';
      return;
    }
    if (!rows || !rows.length) { host.innerHTML = '<div class="dara-note">Tidak ada data.</div>'; return; }
    var chart = window.echarts.init(host);
    var opt = buildOption(spec, rows);
    if (spec.format) {
      if (opt.yAxis && !Array.isArray(opt.yAxis)) {
        opt.yAxis.axisLabel = Object.assign({}, opt.yAxis.axisLabel, { formatter: function (v) { return fmt(v, spec.format); } });
      }
      opt.tooltip = Object.assign({}, opt.tooltip, { valueFormatter: function (v) { return fmt(v, spec.format); } });
    }
    chart.setOption(opt);
    // ECharts menangkap tinggi kontainer saat init. Bila layout berubah
    // (mis. tinggi baru terisi setelah menempel), paksa resize.
    if (typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () { chart.resize(); });
      ro.observe(host);
    }
    window.addEventListener("resize", function () { chart.resize(); });
    // Amankan kasus tinggi 0 di awal (beberapa browser file://).
    setTimeout(function () { chart.resize(); }, 60);
  }

  // Ambil data: default snapshot; bila runtime.dataSource === "api" -> fetch.
  function getRows(id, cb) {
    var rt = META.runtime || {};
    if (rt.dataSource === "api" && rt.apiBaseUrl) {
      fetch(rt.apiBaseUrl.replace(/\\/$/, "") + "/chart/" + encodeURIComponent(id))
        .then(function (r) { return r.json(); })
        .then(function (j) { cb((j && j.data) || j || []); })
        .catch(function () { cb(ROWS[id] || []); });
    } else {
      cb(ROWS[id] || []);
    }
  }

  function renderStep(wrap, step) {
    if (step.title)  wrap.appendChild(el("h2", "dara-step-title", escapeHtml(step.title)));
    if (step.narasi) wrap.appendChild(el("p", "dara-narasi", escapeHtml(step.narasi)));
    var items = step.items || [];
    var maxRow = 8;
    items.forEach(function (it) { maxRow = Math.max(maxRow, (it.y || 0) + (it.h || 8)); });
    var gridEl = el("div", "dara-grid");
    gridEl.style.height = (maxRow * ROW_H) + "px";
    items.forEach(function (it) {
      var cell = el("div", "dara-cell");
      cell.style.left = (it.x / 12 * 100) + "%";
      cell.style.width = (it.w / 12 * 100) + "%";
      cell.style.top = ((it.y || 0) * ROW_H) + "px";
      cell.style.height = ((it.h || 8) * ROW_H) + "px";
      var card;
      if (it.kind === "text") {
        card = el("div", "dara-card dara-text");
        card.appendChild(el("span", null, escapeHtml(it.text || "")));
      } else if (it.chart) {
        card = el("div", "dara-card");
        card.appendChild(el("div", "dara-card-title", escapeHtml(it.chart.title || "")));
        var body = el("div", "dara-card-body");
        card.appendChild(body);
        // Jangan render sekarang: kontainer belum menempel ke DOM (tinggi 0).
        PENDING.push({ host: body, spec: it.chart, id: it.id });
      } else {
        card = el("div", "dara-card");
        card.appendChild(el("div", "dara-note", "Item tidak dikenal"));
      }
      cell.appendChild(card);
      gridEl.appendChild(cell);
    });
    wrap.appendChild(gridEl);
  }

  function boot() {
    var root = document.getElementById("dara-root");
    if (!root) return;
    if (META.bgColor) root.style.background = META.bgColor;
    var head = el("div", "dara-head");
    if (META.logo) head.appendChild(el("span", "dara-logo", escapeHtml(META.logo)));
    var titles = el("div");
    titles.appendChild(el("h1", "dara-title", escapeHtml(META.title || "Dashboard")));
    if (META.subtitle) titles.appendChild(el("p", "dara-subtitle", escapeHtml(META.subtitle)));
    head.appendChild(titles);
    root.appendChild(head);
    (META.steps || []).forEach(function (step) {
      var w = el("div", "dara-step");
      renderStep(w, step);
      root.appendChild(w);
    });
    root.appendChild(el("div", "dara-foot",
      "Dibuat oleh " + escapeHtml(META.generator || "DARA") +
      " · data snapshot (contoh, dibatasi). Sunting setelan untuk data live."));

    // Render chart SETELAH semua node menempel & tata letak selesai supaya
    // ECharts mendapat tinggi kontainer yang benar (bukan 0).
    function mountAll() {
      PENDING.forEach(function (p) {
        getRows(p.id, function (rows) { renderChartInto(p.host, p.spec, rows); });
      });
    }
    if (window.requestAnimationFrame) requestAnimationFrame(mountAll);
    else setTimeout(mountAll, 30);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
`;
}

/* ============================================================
 * 2) STYLESHEET BERSAMA
 * ============================================================ */
export function stylesCss() {
  return `/* styles.css — tata letak dashboard/story ekspor DARA.
   HOW TO USE: cukup di-link dari index.html/index.php. Ubah warna/spacing di sini. */
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
 * 3) BUNDEL HTML+JS (buka index.html, tanpa server)
 * ============================================================ */
export function htmlIndex(meta, generator) {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escAttr(meta.title || "Dashboard")}</title>
  <link rel="stylesheet" href="assets/styles.css" />
</head>
<body>
  <!-- ${generator} — dashboard/story statis. HOW TO USE: buka file ini di browser. -->
  <div id="dara-root"></div>

  <!--
    SETTING ECHARTS:
    Default memuat ECharts dari CDN (butuh internet).
    OFFLINE: unduh echarts.min.js (v5.x) ke folder assets/, lalu ganti baris di
    bawah menjadi:  <script src="assets/echarts.min.js"></script>
  -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js"></script>
  <script src="config.js"></script>
  <script src="data.js"></script>
  <script src="assets/render.js"></script>
</body>
</html>
`;
}

export function htmlConfigJs(meta) {
  return `/**
 * config.js — metadata + LAYOUT dashboard/story (bukan data).
 *
 * HOW TO USE
 *   Otomatis dipakai render.js. Anda jarang perlu menyuntingnya kecuali ingin
 *   mengganti judul, subjudul, atau MODE DATA (snapshot vs API live).
 *
 * SETTINGS PENTING — window.DARA.runtime:
 *   dataSource : "snapshot"  -> pakai data.js (contoh hasil ekspor). Default.
 *                "api"       -> tarik data live dari endpoint Anda sendiri.
 *   apiBaseUrl : URL dasar API bila dataSource = "api". render.js akan memanggil
 *                GET  {apiBaseUrl}/chart/{itemId}  dan mengharapkan JSON:
 *                  { "data": [ {"d1": "...", "v1": 123}, ... ] }
 *                (bentuk baris sama seperti snapshot di data.js).
 *   CATATAN: HTML statis TIDAK bisa konek DB langsung — sediakan endpoint API
 *   sendiri (mis. pakai bundel PHP di folder ini sebagai backend).
 */
window.DARA = ${JSON.stringify(meta, null, 2)};

// SETTING mode data (ubah sesuai kebutuhan):
window.DARA.runtime = {
  dataSource: "snapshot", // "snapshot" | "api"
  apiBaseUrl: ""          // mis. "https://server-anda/api"
};
`;
}

export function htmlDataJs(rowsById) {
  return `/**
 * data.js — SNAPSHOT DATA hasil ekspor (contoh, dibatasi ≤1000 baris per chart).
 *
 * HOW TO USE
 *   Dipakai render.js saat runtime.dataSource = "snapshot" (default).
 *   Untuk data live, JANGAN sunting file ini — atur mode "api" di config.js,
 *   atau ganti nilai di bawah dengan hasil query Anda (bentuk sama: d1,d2,v1,v2).
 *
 * Bentuk: { "<itemId>": [ { "d1": kategori, "d2"?: subkategori, "v1": nilai, "v2"?: nilai2 }, ... ] }
 */
window.DARA_ROWS = ${JSON.stringify(rowsById, null, 2)};
`;
}

export function htmlReadme(meta, generator) {
  return `# ${meta.title || "Dashboard"} — Bundel HTML + JS

Dihasilkan oleh **${generator}** sebagai *template pengembangan terpisah*.
Ini BUKAN aplikasi jadi: data yang disertakan hanya **snapshot contoh**
(maksimal 1000 baris per chart). Untuk data nyata, atur sumber data sendiri.

## Cara menjalankan (paling cepat)
1. Ekstrak folder ini.
2. Buka \`index.html\` di browser (dobel-klik). Selesai — dashboard tampil dari snapshot.
   > Butuh internet untuk memuat ECharts dari CDN. Untuk offline, lihat bagian di bawah.

## Struktur file
- \`index.html\` — halaman utama (memuat ECharts + skrip di bawah).
- \`config.js\` — metadata + layout + **SETTING mode data** (snapshot/api).
- \`data.js\` — snapshot data contoh per chart.
- \`assets/render.js\` — mesin render (grid + chart).
- \`assets/styles.css\` — tampilan.

## Mode OFFLINE (tanpa internet)
Unduh \`echarts.min.js\` (v5.x) ke folder \`assets/\`, lalu di \`index.html\` ganti:
\`\`\`html
<script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js"></script>
\`\`\`
menjadi:
\`\`\`html
<script src="assets/echarts.min.js"></script>
\`\`\`

## Menghubungkan data LIVE (opsional)
HTML statis tidak bisa konek database langsung. Buat endpoint API sendiri, lalu di
\`config.js\` set:
\`\`\`js
window.DARA.runtime = { dataSource: "api", apiBaseUrl: "https://server-anda/api" };
\`\`\`
render.js akan memanggil \`GET {apiBaseUrl}/chart/{itemId}\` dan menampilkan
JSON \`{ "data": [ {"d1":"...","v1":123}, ... ] }\`.
> Butuh backend? Pakai **bundel PHP** (ekspor format PHP) sebagai titik awal.

## Catatan
- Peta (Leaflet) tidak ikut diekspor — ditampilkan sebagai catatan kosong.
- \`itemId\` pada data.js harus sama dengan id item di config.js.
`;
}

/* ============================================================
 * 4) BUNDEL PHP (jalan di server PHP; snapshot + mode live query DB)
 * ============================================================ */
export function phpConfig() {
  return `<?php
/**
 * config.php — SETTINGS koneksi & mode data (WAJIB DISESUAIKAN untuk live).
 *
 * HOW TO USE
 *   File ini dikembalikan sebagai array asosiatif dan dibaca index.php.
 *   Biarkan DATA_SOURCE = 'snapshot' untuk pratinjau cepat (pakai data_snapshot.json).
 *   Ganti ke 'live' + isi kredensial DB untuk menarik data nyata.
 *
 * KEAMANAN: jangan commit kredensial asli ke repositori publik.
 */
return [
  // 'snapshot' = pakai data_snapshot.json (contoh) | 'live' = query database
  'DATA_SOURCE'  => 'snapshot',

  // 'oracle' | 'sqlite' | 'mysql'
  'DB_TYPE'      => 'oracle',

  // ---- SETTING koneksi Oracle (butuh ekstensi php_oci8 aktif) ----
  'ORACLE'       => [
    'host'     => '',        // mis. 10.0.0.10
    'port'     => 1521,
    'service'  => '',        // service name / SID
    'user'     => '',
    'password' => '',
  ],

  // ---- SETTING koneksi SQLite (butuh pdo_sqlite) ----
  'SQLITE'       => [ 'path' => '' ], // mis. /var/data/dara.db

  // ---- SETTING koneksi MySQL/MariaDB (butuh pdo_mysql) ----
  'MYSQL'        => [
    'host'     => '127.0.0.1',
    'port'     => 3306,
    'db'       => '',
    'user'     => '',
    'password' => '',
  ],

  // Prefix tabel data DARA (tabel di query sudah memakai nama lengkap).
  'TABLE_PREFIX' => 'dara_data_',
];
`;
}

export function phpDb() {
  return `<?php
/**
 * db.php — koneksi database ringkas untuk mode 'live'.
 *
 * HOW TO USE
 *   require setelah config.php. Sediakan fungsi dara_query($sql) yang
 *   mengembalikan array baris asosiatif (kunci di-lowercase agar cocok
 *   dengan d1/v1 yang diharapkan render.js).
 *
 * SETTINGS
 *   Driver dipilih dari $CONFIG['DB_TYPE']. Pastikan ekstensi PHP terkait aktif:
 *     - oracle : php_oci8
 *     - sqlite : pdo_sqlite
 *     - mysql  : pdo_mysql
 */

function dara_pdo($CONFIG) {
  static $pdo = null;
  if ($pdo !== null) return $pdo;
  $type = $CONFIG['DB_TYPE'];
  if ($type === 'sqlite') {
    $pdo = new PDO('sqlite:' . $CONFIG['SQLITE']['path']);
  } elseif ($type === 'mysql') {
    $m = $CONFIG['MYSQL'];
    $dsn = "mysql:host={$m['host']};port={$m['port']};dbname={$m['db']};charset=utf8mb4";
    $pdo = new PDO($dsn, $m['user'], $m['password']);
  } else {
    return null; // oracle ditangani oci8 di bawah
  }
  $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
  return $pdo;
}

/** Jalankan SELECT, kembalikan array baris (kunci lowercase). */
function dara_query($sql) {
  global $CONFIG;
  $type = $CONFIG['DB_TYPE'];

  if ($type === 'oracle') {
    // ---- Oracle via oci8 ----
    $o = $CONFIG['ORACLE'];
    $conn_str = "//{$o['host']}:{$o['port']}/{$o['service']}";
    $conn = oci_connect($o['user'], $o['password'], $conn_str, 'AL32UTF8');
    if (!$conn) { $e = oci_error(); throw new Exception('Koneksi Oracle gagal: ' . $e['message']); }
    $stmt = oci_parse($conn, $sql);
    oci_execute($stmt);
    $rows = [];
    while (($r = oci_fetch_assoc($stmt)) !== false) {
      $rows[] = array_change_key_case($r, CASE_LOWER);
    }
    oci_free_statement($stmt);
    oci_close($conn);
    return $rows;
  }

  // ---- SQLite / MySQL via PDO ----
  $pdo = dara_pdo($CONFIG);
  $stmt = $pdo->query($sql);
  $rows = [];
  foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
    $rows[] = array_change_key_case($r, CASE_LOWER);
  }
  return $rows;
}
`;
}

export function phpQueries(sqlById) {
  return `<?php
/**
 * queries.php — SQL agregasi per chart + pengambil data.
 *
 * HOW TO USE
 *   Fungsi dara_get_rows($id) dipanggil index.php untuk tiap chart.
 *   - DATA_SOURCE = 'snapshot' -> baca data_snapshot.json (contoh).
 *   - DATA_SOURCE = 'live'     -> jalankan SQL di \$DARA_SQL[$id] ke database.
 *
 * SETTINGS
 *   SQL di bawah dibuat otomatis dari definisi chart. SESuaikan bila:
 *     - nama tabel/skema berbeda (mis. tambah owner: SKEMA.tabel),
 *     - dialek DB berbeda (fungsi/kutip identifier),
 *     - perlu filter tambahan (tambah klausa WHERE).
 *   Alias kolom d1,d2,v1,v2 WAJIB dipertahankan agar cocok dengan render.js.
 */

\$DARA_SQL = ${phpAssoc(sqlById)};

function dara_get_rows(\$id) {
  global \$CONFIG, \$DARA_SQL;

  if ((\$CONFIG['DATA_SOURCE'] ?? 'snapshot') !== 'live') {
    // Mode snapshot: ambil dari file contoh.
    static \$snap = null;
    if (\$snap === null) {
      \$raw = @file_get_contents(__DIR__ . '/data_snapshot.json');
      \$snap = \$raw ? json_decode(\$raw, true) : [];
    }
    return \$snap[\$id] ?? [];
  }

  // Mode live: jalankan query (butuh db.php ter-require & koneksi terisi).
  if (!isset(\$DARA_SQL[\$id])) return [];
  try {
    return dara_query(\$DARA_SQL[\$id]);
  } catch (Exception \$e) {
    error_log('DARA query gagal (' . \$id . '): ' . \$e->getMessage());
    return [];
  }
}
`;
}

export function phpIndex(generator) {
  return `<?php
/**
 * index.php — halaman utama dashboard/story ekspor DARA (PHP).
 *
 * HOW TO USE
 *   1. Letakkan folder ini di server PHP (mis. \`php -S localhost:8000\` atau XAMPP).
 *   2. Buka di browser. Default menampilkan data snapshot.
 *   3. Untuk data live: sunting config.php (DATA_SOURCE='live' + koneksi DB).
 *
 * Alur: config.php -> db.php -> queries.php -> kumpulkan rows -> suntik ke render.js.
 */
\$CONFIG = require __DIR__ . '/config.php';
require __DIR__ . '/db.php';
require __DIR__ . '/queries.php';

\$META = json_decode(file_get_contents(__DIR__ . '/dara_meta.json'), true);

// Kumpulkan data tiap chart (snapshot atau live sesuai config).
\$ROWS = [];
foreach ((\$META['steps'] ?? []) as \$step) {
  foreach ((\$step['items'] ?? []) as \$it) {
    if ((\$it['kind'] ?? '') === 'chart') {
      \$ROWS[\$it['id']] = dara_get_rows(\$it['id']);
    }
  }
}
?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= htmlspecialchars(\$META['title'] ?? 'Dashboard') ?></title>
  <link rel="stylesheet" href="assets/styles.css" />
</head>
<body>
  <!-- ${generator} — render server-side data, tampilan client-side (ECharts). -->
  <div id="dara-root"></div>
  <script>
    window.DARA = <?= json_encode(\$META, JSON_UNESCAPED_UNICODE) ?>;
    window.DARA_ROWS = <?= json_encode(\$ROWS, JSON_UNESCAPED_UNICODE) ?>;
  </script>
  <!-- SETTING ECHARTS: default CDN. Offline: unduh ke assets/echarts.min.js & ganti src. -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js"></script>
  <script src="assets/render.js"></script>
</body>
</html>
`;
}

export function phpReadme(meta, generator) {
  return `# ${meta.title || "Dashboard"} — Bundel PHP

Dihasilkan oleh **${generator}** sebagai *template pengembangan terpisah*.
Data yang disertakan hanya **snapshot contoh** (≤1000 baris per chart). Untuk data
nyata, isi koneksi DB dan aktifkan mode live.

## Cara menjalankan
### A. Pratinjau cepat (snapshot, tanpa DB)
1. Ekstrak folder ini.
2. Jalankan server PHP di folder ini:
   \`\`\`bash
   php -S localhost:8000
   \`\`\`
3. Buka http://localhost:8000 — dashboard tampil dari \`data_snapshot.json\`.

### B. Data LIVE (query database)
1. Sunting \`config.php\`:
   - \`DATA_SOURCE => 'live'\`
   - \`DB_TYPE\` = \`oracle\` | \`sqlite\` | \`mysql\`
   - Isi blok koneksi yang sesuai (host, user, password, dst).
2. Pastikan ekstensi PHP aktif: \`php_oci8\` (Oracle) / \`pdo_sqlite\` / \`pdo_mysql\`.
3. Periksa/ubah SQL di \`queries.php\` bila nama tabel/skema berbeda.
4. Jalankan ulang server dan buka di browser.

## Struktur file
- \`index.php\` — halaman utama (kumpulkan data → render).
- \`config.php\` — **SETTINGS koneksi & mode data**.
- \`db.php\` — koneksi DB + \`dara_query()\`.
- \`queries.php\` — SQL agregasi per chart + \`dara_get_rows()\`.
- \`data_snapshot.json\` — data contoh (fallback / mode snapshot).
- \`dara_meta.json\` — metadata + layout dashboard.
- \`assets/render.js\`, \`assets/styles.css\` — render & tampilan.

## Penting
- Alias kolom \`d1, d2, v1, v2\` di SQL WAJIB dipertahankan (dipakai render.js).
- Peta (Leaflet) tidak ikut diekspor.
- Kunci \`itemId\` pada snapshot/SQL harus sama dengan id item di \`dara_meta.json\`.
`;
}

/* ---------- util kecil ---------- */

/** Escape untuk atribut HTML. */
function escAttr(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

/** Ubah objek {id: sql} menjadi literal array PHP yang rapi & aman. */
function phpAssoc(obj) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "[]";
  const lines = entries.map(([k, v]) => {
    const key = String(k).replace(/'/g, "\\'");
    const val = String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `  '${key}' => '${val}',`;
  });
  return "[\n" + lines.join("\n") + "\n]";
}
