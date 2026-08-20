/**
 * Suggestions Controller — handler HTTP untuk usulan chart.
 */

import { suggestionsService } from "./suggestions.service.js";
import { sanitizeFilters } from "../../lib/filterSql.js";

/** Validasi nama tabel/kolom sederhana (huruf, angka, underscore). */
function isSafeName(name) {
  return typeof name === "string" && /^[A-Za-z0-9_]+$/.test(name);
}

export const suggestionsController = {
  /** GET /api/databases/tables/:table/suggestions */
  async list(req, res) {
    try {
      const { table } = req.params;
      if (!isSafeName(table)) {
        return res.status(400).json({ error: "Nama tabel tidak valid" });
      }
      const result = await suggestionsService.suggestForTable(table);
      res.json({ data: result });
    } catch (err) {
      console.error("Error suggestions:", err);
      res.status(500).json({ error: "Gagal membuat usulan chart" });
    }
  },

  /**
   * GET /api/databases/tables/:table/chart-data
   * Query: dimension, measure (opsional), aggregation
   * Mengembalikan data teragregasi untuk me-render satu chart.
   */
  async chartData(req, res) {
    try {
      const { table } = req.params;
      const { dimension, measure, aggregation, chartType } = req.query;
      const { joinTable, joinLocalKey, joinLabel, joinTargetKey } = req.query;

      if (!isSafeName(table) || !isSafeName(dimension)) {
        return res.status(400).json({ error: "Parameter tidak valid" });
      }
      if (measure && !isSafeName(measure)) {
        return res.status(400).json({ error: "Nama measure tidak valid" });
      }

      // Rakit info JOIN bila ada, sekaligus validasi semua identifier.
      let join = null;
      if (joinTable) {
        if (![joinTable, joinLocalKey, joinLabel].every(isSafeName) ||
            (joinTargetKey && !isSafeName(joinTargetKey))) {
          return res.status(400).json({ error: "Parameter join tidak valid" });
        }
        join = {
          table: joinTable,
          localKey: joinLocalKey,
          label: joinLabel,
          targetKey: joinTargetKey || "id",
        };
      }

      const rows = await suggestionsService.getChartData(table, {
        dimension,
        measure: measure || null,
        aggregation: aggregation || "COUNT",
        chartType: chartType || "bar",
        join,
      });
      res.json({ data: rows });
    } catch (err) {
      console.error("Error chart-data:", err);
      res.status(500).json({ error: "Gagal mengambil data chart" });
    }
  },

  /**
   * GET /api/databases/tables/:table/chart-data-multi (v0.5.0)
   * Query: dims=a,b  measures=x,y  aggregation  chartType
   *        joinTable joinLocalKey joinLabel joinTargetKey (opsional)
   * Hasil baris generik: { d1, d2?, v1, v2? }
   */
  async chartDataMulti(req, res) {
    try {
      const { table } = req.params;
      const { aggregation, chartType } = req.query;
      const { joinTable, joinLocalKey, joinLabel, joinTargetKey } = req.query;

      const dims = (req.query.dims || "").split(",").filter(Boolean);
      const measures = (req.query.measures || "").split(",").filter(Boolean);

      // Validasi identifier satu per satu.
      if (!isSafeName(table) || dims.some((d) => !isSafeName(d)) ||
          measures.some((m) => !isSafeName(m))) {
        return res.status(400).json({ error: "Parameter tidak valid" });
      }
      if (dims.length > 2 || measures.length > 2) {
        return res.status(400).json({ error: "Maksimal 2 dimensi dan 2 measure" });
      }

      let join = null;
      if (joinTable) {
        if (![joinTable, joinLocalKey, joinLabel].every(isSafeName) ||
            (joinTargetKey && !isSafeName(joinTargetKey))) {
          return res.status(400).json({ error: "Parameter join tidak valid" });
        }
        join = { table: joinTable, localKey: joinLocalKey, label: joinLabel,
                 targetKey: joinTargetKey || "id" };
      }

      // Filter global (slicer). Dukung 3 bentuk (v0.21.0):
      //   {column,value} equality | {column,values:[]} multi | {column,from,to} rentang
      let filters = [];
      if (req.query.filters) {
        try { filters = sanitizeFilters(JSON.parse(req.query.filters)); }
        catch { /* filters rusak -> abaikan, jangan gagalkan chart */ }
      }

      // R2-4: grain tanggal (year|month|day) + top-N.
      const dateGrain = ["year", "month", "day"].includes(req.query.dateGrain)
        ? req.query.dateGrain : null;
      const topN = Math.max(0, Math.min(100, parseInt(req.query.topN, 10) || 0));

      // R2-5: calculated field. [{name, expr}] via query JSON. Ekspresi
      // divalidasi/aman di buildCalcSql (repository).
      let calcMeasures = [];
      if (req.query.calc) {
        try {
          const arr = JSON.parse(req.query.calc);
          if (Array.isArray(arr)) {
            calcMeasures = arr.filter((c) => c && typeof c.expr === "string").slice(0, 2);
          }
        } catch { /* calc rusak → abaikan */ }
      }

      const rows = await suggestionsService.getChartDataMulti(table, {
        dims, measures,
        aggregation: aggregation || "SUM",
        chartType: chartType || "bar",
        join,
        filters,
        dateGrain,
        topN,
        calcMeasures,
      });
      res.json({ data: rows });
    } catch (err) {
      // Ekspresi calculated field tak valid → 400 dengan pesan jelas.
      if (/kolom|ekspresi|operator|kurung|token|karakter/i.test(err.message)) {
        return res.status(400).json({ error: err.message });
      }
      console.error("Error chart-data-multi:", err);
      res.status(500).json({ error: "Gagal mengambil data chart" });
    }
  },
};

export default suggestionsController;
