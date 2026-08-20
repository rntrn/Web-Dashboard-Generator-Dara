/**
 * dataprepTables Routes — /api/dataprep-tables (wajib login, BUKAN
 * admin-only). Mengelola tabel HASIL Data Preparation (dara_data_prep_*):
 * daftar/bagikan/hapus. TIDAK memicu preview/save baru (itu di
 * dataprep.routes.js, admin-only) — pola identik connImports.routes.js.
 */

import { Router } from "express";
import { dataprepService } from "./dataprep.service.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();

router.get("/", (req, res) => res.json({ data: dataprepService.list(req.user) }));

router.post("/:id/share", (req, res) => {
  try {
    const m = dataprepService.setSharedWith(req.params.id, req.body?.sharedWith, req.user);
    logActivity(req.user, "share", "table", m.name);
    res.json({ data: m });
  } catch (err) { res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const ok = await dataprepService.remove(req.params.id, req.user);
    if (!ok) return res.status(404).json({ error: "Tabel tidak ditemukan" });
    logActivity(req.user, "delete", "table", req.params.id);
    res.json({ data: { deleted: true } });
  } catch (err) { res.status(403).json({ error: err.message }); }
});

export default router;
