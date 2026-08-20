/**
 * Uploads Routes — /api/uploads (wajib login).
 * Body JSON besar (data hasil parse CSV/Excel) ditangani parser global 40mb (app.js).
 */

import { Router } from "express";
import { uploadsService } from "./uploads.service.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();

// Status modul (semua user login boleh tahu aktif/tidak)
router.get("/status", (req, res) => res.json({ data: { enabled: uploadsService.isEnabled() } }));

// Daftar tabel upload yang boleh diakses user
router.get("/", (req, res) => res.json({ data: uploadsService.list(req.user) }));

// Buat tabel dari data upload
router.post("/", async (req, res) => {
  try {
    const meta = await uploadsService.create(req.body || {}, req.user);
    logActivity(req.user, "upload", "table", meta.name);
    res.status(201).json({ data: meta });
  } catch (err) {
    res.status(/dimatikan/.test(err.message) ? 403 : 400).json({ error: err.message });
  }
});

router.post("/:id/share", (req, res) => {
  try {
    const m = uploadsService.setSharedWith(req.params.id, req.body?.sharedWith, req.user);
    logActivity(req.user, "share", "table", m.name);
    res.json({ data: m });
  } catch (err) { res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const ok = await uploadsService.remove(req.params.id, req.user);
    if (!ok) return res.status(404).json({ error: "Tabel tidak ditemukan" });
    logActivity(req.user, "delete", "table", req.params.id);
    res.json({ data: { deleted: true } });
  } catch (err) { res.status(403).json({ error: err.message }); }
});

export default router;
