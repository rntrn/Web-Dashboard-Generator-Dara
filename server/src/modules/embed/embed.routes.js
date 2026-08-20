/**
 * Embed Routes — /api/embed (PUBLIK, tanpa login, diamankan kunci embed).
 *
 * Dipakai viewer /view/:id (iframe dari MANDOR). Keamanan:
 *  - Semua endpoint wajib ?key=<embedKey> yang cocok (constant-time compare).
 *  - Data chart diambil berdasarkan SPESIFIKASI TERSIMPAN di server —
 *    klien tidak bisa meminta tabel/kolom sembarangan.
 *  - Filter hanya boleh kolom yang terdefinisi di dashboard.filters.
 */

import { Router } from "express";
import { dashboardsService } from "../dashboards/dashboards.service.js";
import { storiesService } from "../stories/stories.service.js";
import { suggestionsService } from "../suggestions/suggestions.service.js";
import { suggestionsRepository } from "../suggestions/suggestions.repository.js";
import { sanitizeFilters } from "../../lib/filterSql.js";

const router = Router();

/**
 * Parse ?filters= untuk embed: sanitasi bentuk (value/values/from/to) LALU
 * batasi hanya kolom yang memang didefinisikan sebagai slicer dashboard.
 * @param {string} raw - req.query.filters (JSON)
 * @param {Set<string>} allowedCols - kolom slicer UPPERCASE
 */
function parseEmbedFilters(raw, allowedCols) {
  try {
    return sanitizeFilters(JSON.parse(raw || "[]"))
      .filter((f) => allowedCols.has(String(f.column).toUpperCase()));
  } catch { return []; }
}

/** GET /api/embed/story/:id?key= — story publik (metadata + tiap dashboard). */
router.get("/story/:id", (req, res) => {
  const story = storiesService.getForEmbed(req.params.id, req.query.key);
  if (!story) return res.status(404).json({ error: "Story tidak ditemukan" });
  // Bersihkan kunci: hilangkan embedKey story & dashboard dari payload publik.
  const { embedKey, ...safe } = story;
  safe.steps = safe.steps.map((st) => {
    if (!st.dashboard) return st;
    const { embedKey: _ek, ...dash } = st.dashboard;
    return { ...st, dashboard: dash };
  });
  res.json({ data: safe });
});

/**
 * GET /api/embed/story/:id/dashboard/:dashId/chart/:chartId/data?key=&filters=
 * Data satu chart dalam konteks story. Kunci STORY yang divalidasi; dashId &
 * chartId harus benar-benar bagian dari story tsb (cegah akses silang).
 */
router.get("/story/:id/dashboard/:dashId/chart/:chartId/data", async (req, res) => {
  try {
    const story = storiesService.getForEmbed(req.params.id, req.query.key);
    if (!story) return res.status(404).json({ error: "Story tidak ditemukan" });

    const step = story.steps.find((s) => s.dashboardId === req.params.dashId && s.dashboard);
    if (!step) return res.status(404).json({ error: "Dashboard bukan bagian story ini" });
    const dash = step.dashboard;

    const item = dash.items.find(
      (it) => it.kind === "chart" && it.chartId === req.params.chartId && it.chart);
    if (!item) return res.status(404).json({ error: "Chart tidak ada" });
    const chart = item.chart;

    const allowedCols = new Set((dash.filters || []).map((f) => f.column.toUpperCase()));
    const filters = parseEmbedFilters(req.query.filters, allowedCols);

    const rows = await suggestionsService.getChartDataMulti(chart.table, {
      dims: chart.dimensions, measures: chart.measures,
      aggregation: chart.aggregation, chartType: chart.chartType,
      join: chart.join, filters,
    });
    res.json({ data: rows });
  } catch (err) {
    console.error("Error embed story chart-data:", err);
    res.status(500).json({ error: "Gagal memuat data chart" });
  }
});

/** GET /api/embed/story/:id/distinct?key=&dashId=&filterId= — nilai slicer. */
router.get("/story/:id/distinct", async (req, res) => {
  try {
    const story = storiesService.getForEmbed(req.params.id, req.query.key);
    if (!story) return res.status(404).json({ error: "Story tidak ditemukan" });
    const step = story.steps.find((s) => s.dashboardId === req.query.dashId && s.dashboard);
    if (!step) return res.status(404).json({ error: "Dashboard tidak ada" });
    const f = (step.dashboard.filters || []).find((x) => x.id === req.query.filterId);
    if (!f) return res.status(404).json({ error: "Filter tidak ditemukan" });
    const allowedCols = new Set((step.dashboard.filters || []).map((x) => x.column.toUpperCase()));
    const others = parseEmbedFilters(req.query.filters, allowedCols)
      .filter((x) => String(x.column).toUpperCase() !== String(f.column).toUpperCase());
    const values = await suggestionsRepository.getDistinctValues(f.table, f.column, others);
    res.json({ data: values });
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat nilai" });
  }
});

/** Ambil dashboard bila kunci cocok; kirim 404 generik bila tidak (jangan bocorkan info). */
function getDash(req, res) {
  const dash = dashboardsService.getForEmbed(req.params.id, req.query.key);
  if (!dash) {
    res.status(404).json({ error: "Dashboard tidak ditemukan" });
    return null;
  }
  return dash;
}

/** GET /api/embed/:id?key= — metadata dashboard + spesifikasi chart. */
router.get("/:id", (req, res) => {
  const dash = getDash(req, res);
  if (!dash) return;
  // Jangan bocorkan embedKey/createdBy detail berlebih ke halaman publik
  const { embedKey, ...safe } = dash;
  res.json({ data: safe });
});

/**
 * GET /api/embed/:id/chart/:chartId/data?key=&filters=[{"column","value"}]
 * Data untuk SATU chart milik dashboard ini (spec dari server).
 */
router.get("/:id/chart/:chartId/data", async (req, res) => {
  try {
    const dash = getDash(req, res);
    if (!dash) return;

    const item = dash.items.find(
      (it) => it.kind === "chart" && it.chartId === req.params.chartId && it.chart
    );
    if (!item) return res.status(404).json({ error: "Chart tidak ada di dashboard ini" });
    const chart = item.chart;

    // Filter: hanya kolom yang memang didefinisikan sebagai slicer dashboard.
    const allowedCols = new Set((dash.filters || []).map((f) => f.column.toUpperCase()));
    const filters = parseEmbedFilters(req.query.filters, allowedCols);

    const rows = await suggestionsService.getChartDataMulti(chart.table, {
      dims: chart.dimensions,
      measures: chart.measures,
      aggregation: chart.aggregation,
      chartType: chart.chartType,
      join: chart.join,
      filters,
    });
    res.json({ data: rows });
  } catch (err) {
    console.error("Error embed chart-data:", err);
    res.status(500).json({ error: "Gagal memuat data chart" });
  }
});

/**
 * GET /api/embed/:id/distinct?key=&filterId=
 * Nilai pilihan untuk satu slicer yang terdefinisi di dashboard.
 */
router.get("/:id/distinct", async (req, res) => {
  try {
    const dash = getDash(req, res);
    if (!dash) return;
    const f = (dash.filters || []).find((x) => x.id === req.query.filterId);
    if (!f) return res.status(404).json({ error: "Filter tidak ditemukan" });
    const allowedCols = new Set((dash.filters || []).map((x) => x.column.toUpperCase()));
    const others = parseEmbedFilters(req.query.filters, allowedCols)
      .filter((x) => String(x.column).toUpperCase() !== String(f.column).toUpperCase());
    const values = await suggestionsRepository.getDistinctValues(f.table, f.column, others);
    res.json({ data: values });
  } catch (err) {
    console.error("Error embed distinct:", err);
    res.status(500).json({ error: "Gagal memuat nilai filter" });
  }
});

export default router;
