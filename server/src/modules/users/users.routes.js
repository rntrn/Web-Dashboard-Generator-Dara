/**
 * Users Routes — /api/users (khusus admin): kelola pengguna aplikasi.
 */

import { Router } from "express";
import { usersService } from "./users.service.js";
import { requireAuth, requireAdmin } from "../../middlewares/auth.js";
import { listActivity } from "../../lib/activityLog.js";

const router = Router();

// Cari user untuk fitur "Bagikan" — semua user login (bukan hanya admin).
router.get("/search", requireAuth, async (req, res) => {
  try { res.json({ data: await usersService.search(req.query.q) }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- Di bawah ini KHUSUS ADMIN ----
router.use(requireAuth, requireAdmin);

router.get("/", async (req, res) => {
  try { res.json({ data: await usersService.list() }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// Modul ACL (hak akses per-item) — status & toggle
router.get("/acl", (req, res) => res.json({ data: { enabled: usersService.getAclEnabled() } }));
router.post("/acl", (req, res) =>
  res.json({ data: { enabled: usersService.setAclEnabled(!!(req.body && req.body.on)) } }));

// Modul Upload CSV/Excel — status & toggle
router.get("/upload", (req, res) => res.json({ data: { enabled: usersService.getUploadEnabled() } }));
router.post("/upload", (req, res) =>
  res.json({ data: { enabled: usersService.setUploadEnabled(!!(req.body && req.body.on)) } }));

// Log penggunaan (aktivitas terbaru) — admin
router.get("/activity", (req, res) =>
  res.json({ data: listActivity(Number(req.query.limit) || 200) }));

// Mode dev (popup error) — toggle admin
router.get("/devmode", (req, res) => res.json({ data: { devMode: usersService.getDevMode() } }));
router.post("/devmode", (req, res) =>
  res.json({ data: { devMode: usersService.setDevMode(!!(req.body && req.body.on)) } }));

router.post("/", async (req, res) => {
  try { res.status(201).json({ data: await usersService.add(req.body || {}) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.put("/:nip", async (req, res) => {
  try { res.json({ data: await usersService.update(req.params.nip, req.body || {}) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete("/:nip", async (req, res) => {
  try {
    const ok = await usersService.remove(req.params.nip);
    if (!ok) return res.status(404).json({ error: "NIP tidak ditemukan" });
    res.json({ data: { deleted: true } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
