/**
 * Data Preparation Routes — /api/dataprep (admin-only, lihat
 * dataprep.service.js untuk kenapa: recipe bisa menyentuh tabel privat
 * pengguna lain). Mengelola tabel HASIL-nya ada di dataprepTables.routes.js
 * (`/api/dataprep-tables`, cuma requireAuth).
 */

import { Router } from "express";
import { dataprepService } from "./dataprep.service.js";
import { relationsService } from "../relations/relations.service.js";
import { requireAdmin } from "../../middlewares/auth.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();
router.use(requireAdmin);

// Saran JOIN untuk sebuah tabel sumber (reuse mesin yang sama dipakai
// usulan chart otomatis) — FK asli lalu konvensi nama "<x>_id".
router.get("/relations/:table", async (req, res) => {
  try {
    const rel = await relationsService.resolveRelations(req.params.table);
    res.json({ data: rel });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/preview", async (req, res) => {
  try {
    const result = await dataprepService.preview(req.body?.recipe || {});
    res.json({ data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/save", async (req, res) => {
  try {
    const meta = await dataprepService.save(
      { recipe: req.body?.recipe || {}, name: req.body?.name, rowLimit: req.body?.rowLimit },
      req.user
    );
    logActivity(req.user, "dataprep-save", "table", meta.name);
    res.status(201).json({ data: meta });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
