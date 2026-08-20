/**
 * Suggestions Routes
 * Endpoint usulan chart, di-mount di bawah /api/databases.
 */

import { Router } from "express";
import { suggestionsController } from "./suggestions.controller.js";
import { relationsService } from "../relations/relations.service.js";
import { sanitizeFilters } from "../../lib/filterSql.js";

const router = Router();

router.get("/tables/:table/suggestions", suggestionsController.list);
router.get("/tables/:table/chart-data", suggestionsController.chartData);
router.get("/tables/:table/chart-data-multi", suggestionsController.chartDataMulti);

// Nilai distinct sebuah kolom (untuk dropdown slicer dashboard)
router.get("/tables/:table/distinct", async (req, res) => {
  try {
    const { table } = req.params;
    const { column } = req.query;
    const SAFE = /^[A-Za-z0-9_]+$/;
    if (!SAFE.test(table) || !SAFE.test(column || "")) {
      return res.status(400).json({ error: "Parameter tidak valid" });
    }
    // Cascading: filter slicer LAIN (kecuali kolom ini sendiri) mempersempit opsi.
    let others = [];
    if (req.query.filters) {
      try {
        others = sanitizeFilters(JSON.parse(req.query.filters))
          .filter((f) => String(f.column).toUpperCase() !== String(column).toUpperCase());
      } catch { /* abaikan */ }
    }
    const { suggestionsRepository } = await import("./suggestions.repository.js");
    const rows = await suggestionsRepository.getDistinctValues(table, column, others);
    res.json({ data: rows });
  } catch (err) {
    console.error("Error distinct:", err);
    res.status(500).json({ error: "Gagal memuat nilai" });
  }
});

// Relasi tabel (untuk chart builder manual: pilihan dimensi JOIN)
router.get("/tables/:table/relations", async (req, res) => {
  try {
    const rels = await relationsService.resolveRelations(req.params.table);
    res.json({ data: rels });
  } catch (err) {
    console.error("Error relations:", err);
    res.status(500).json({ error: "Gagal memuat relasi" });
  }
});

export default router;
