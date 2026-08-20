/**
 * Option Builders — ubah data generik backend menjadi option ECharts.
 *
 * Data dari /chart-data-multi berbentuk baris: { d1, d2?, v1, v2? }
 *   d1, d2 = nilai dimensi   |   v1, v2 = nilai measure teragregasi
 *
 * Menambah tipe chart baru:
 *   1. Daftarkan di server/src/config/chartTypes.js (prasyarat dim/mea)
 *   2. Tambah builder di BUILDERS di bawah ini. Selesai.
 */

const PALETTE = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

/** Nama measure untuk legend (dikirim dari spec). */
function meaNames(spec) {
  const ms = spec.measures || [];
  return ms.length ? ms : ["nilai"];
}

const base = {
  tooltip: { trigger: "axis" },
  grid: { left: 48, right: 16, top: 36, bottom: 40 },
  color: PALETTE,
};

/** Sumbu kategori + 1-2 seri nilai (dipakai bar/line/area). */
function axisSeries(rows, spec, seriesType, extra = {}) {
  const names = meaNames(spec);
  const series = names.map((n, i) => ({
    name: n,
    type: seriesType,
    data: rows.map((r) => r[`v${i + 1}`]),
    ...extra,
  }));
  return {
    ...base,
    legend: names.length > 1 ? { top: 0 } : undefined,
    xAxis: { type: "category", data: rows.map((r) => String(r.d1)), axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", axisLabel: { fontSize: 10 } },
    series,
  };
}

export const BUILDERS = {
  bar: (rows, spec) => axisSeries(rows, spec, "bar"),

  line: (rows, spec) => axisSeries(rows, spec, "line", { smooth: true }),

  area: (rows, spec) => axisSeries(rows, spec, "line", { smooth: true, areaStyle: {} }),

  hbar: (rows, spec) => {
    const names = meaNames(spec);
    return {
      ...base,
      grid: { left: 110, right: 16, top: 16, bottom: 30 },
      xAxis: { type: "value", axisLabel: { fontSize: 10 } },
      yAxis: { type: "category", data: rows.map((r) => String(r.d1)).reverse(), axisLabel: { fontSize: 10 } },
      series: [{ name: names[0], type: "bar", data: rows.map((r) => r.v1).reverse() }],
    };
  },

  stackedbar: (rows) => {
    // d1 = sumbu X, d2 = sub-kategori (stack), v1 = nilai
    const xs = [...new Set(rows.map((r) => String(r.d1)))];
    const subs = [...new Set(rows.map((r) => String(r.d2)))];
    const series = subs.map((s) => ({
      name: s, type: "bar", stack: "total",
      data: xs.map((x) => {
        const row = rows.find((r) => String(r.d1) === x && String(r.d2) === s);
        return row ? row.v1 : 0;
      }),
    }));
    return {
      ...base,
      legend: { top: 0, type: "scroll" },
      xAxis: { type: "category", data: xs, axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", axisLabel: { fontSize: 10 } },
      series,
    };
  },

  pie: (rows) => ({
    color: PALETTE,
    tooltip: { trigger: "item" },
    series: [{
      type: "pie", radius: "70%",
      data: rows.map((r) => ({ name: String(r.d1), value: r.v1 })),
      label: { fontSize: 10 },
    }],
  }),

  donut: (rows) => ({
    color: PALETTE,
    tooltip: { trigger: "item" },
    series: [{
      type: "pie", radius: ["45%", "70%"],
      data: rows.map((r) => ({ name: String(r.d1), value: r.v1 })),
      label: { fontSize: 10 },
    }],
  }),

  scatter: (rows, spec) => {
    const names = meaNames(spec);
    return {
      color: PALETTE,
      tooltip: {
        trigger: "item",
        formatter: (p) =>
          `${p.data[2] ?? ""}<br/>${names[0]}: ${p.data[0]}<br/>${names[1]}: ${p.data[1]}`,
      },
      grid: base.grid,
      xAxis: { type: "value", name: names[0], axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", name: names[1], axisLabel: { fontSize: 10 } },
      series: [{
        type: "scatter", symbolSize: 12,
        data: rows.map((r) => [r.v1, r.v2, r.d1 != null ? String(r.d1) : undefined]),
      }],
    };
  },

  radar: (rows, spec) => {
    // indikator = measures; satu kurva per nilai dimensi
    const names = meaNames(spec);
    const maxes = names.map((_, i) => Math.max(...rows.map((r) => r[`v${i + 1}`] || 0)) * 1.1 || 1);
    return {
      color: PALETTE,
      tooltip: {},
      legend: { top: 0, type: "scroll" },
      radar: { indicator: names.map((n, i) => ({ name: n, max: maxes[i] })) },
      series: [{
        type: "radar",
        data: rows.slice(0, 8).map((r) => ({
          name: String(r.d1),
          value: names.map((_, i) => r[`v${i + 1}`] || 0),
        })),
      }],
    };
  },

  heatmap: (rows) => {
    const xs = [...new Set(rows.map((r) => String(r.d1)))];
    const ys = [...new Set(rows.map((r) => String(r.d2)))];
    const vals = rows.map((r) => r.v1);
    return {
      tooltip: { position: "top" },
      grid: { left: 90, right: 16, top: 16, bottom: 60 },
      xAxis: { type: "category", data: xs, axisLabel: { fontSize: 10 } },
      yAxis: { type: "category", data: ys, axisLabel: { fontSize: 10 } },
      visualMap: {
        min: Math.min(...vals), max: Math.max(...vals),
        orient: "horizontal", left: "center", bottom: 0, itemHeight: 80,
      },
      series: [{
        type: "heatmap",
        data: rows.map((r) => [String(r.d1), String(r.d2), r.v1]),
        label: { show: true, fontSize: 9 },
      }],
    };
  },

  funnel: (rows) => ({
    color: PALETTE,
    tooltip: { trigger: "item" },
    series: [{
      type: "funnel", sort: "descending", label: { fontSize: 10 },
      data: rows.map((r) => ({ name: String(r.d1), value: r.v1 })),
    }],
  }),

  treemap: (rows) => ({
    color: PALETTE,
    tooltip: { trigger: "item" },
    series: [{
      type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
      data: rows.map((r) => ({ name: String(r.d1), value: r.v1 })),
      label: { fontSize: 10 },
    }],
  }),

  gauge: (rows, spec) => {
    const v = rows[0] ? rows[0].v1 : 0;
    const names = meaNames(spec);
    return {
      series: [{
        type: "gauge",
        max: Math.max(v * 1.4, 1),
        progress: { show: true },
        detail: { fontSize: 18, formatter: "{value}" },
        data: [{ value: Math.round(v * 100) / 100, name: names[0] }],
      }],
    };
  },
};

/**
 * Bangun option ECharts; fallback ke bar bila tipe tak dikenal.
 * Prioritas warna: palet tema dashboard > warna individual chart > default.
 * spec.format -> memformat angka di sumbu Y & tooltip.
 */
export function buildOption(chartType, rows, spec, palette = null) {
  const builder = BUILDERS[chartType] || BUILDERS.bar;
  const option = builder(rows, spec);
  if (palette && palette.length) {
    option.color = palette;
  } else if (spec && spec.color) {
    option.color = [spec.color, ...PALETTE.filter((c) => c !== spec.color)];
  }
  // Format angka (dari lib/format) diterapkan ke label sumbu Y & tooltip.
  if (spec && spec.format && spec._fmt) {
    const f = spec._fmt;
    if (option.yAxis && !Array.isArray(option.yAxis)) {
      option.yAxis.axisLabel = { ...(option.yAxis.axisLabel || {}), formatter: (v) => f(v) };
    }
    option.tooltip = { ...(option.tooltip || {}), valueFormatter: (v) => f(v) };
  }
  return option;
}

export default buildOption;
