/**
 * connImports Routes — /api/conn-imports (wajib login, BUKAN admin-only).
 *
 * Beda dengan /api/connections (admin-only, kredensial sensitif): endpoint
 * di sini mengelola tabel HASIL import (dara_data_conn_*), bukan koneksi
 * itu sendiri. Tabel hasil import harus bisa dipakai/dibagikan oleh siapa
 * pun yang diberi akses (ACL per-item di connImports.service.js), sama
 * persis pola uploads.routes.js — TIDAK ada aksi di sini yang menyentuh
 * kredensial koneksi atau memicu import baru (itu di connections.routes.js,
 * lihat POST /api/connections/:id/import).
 */

import { Router } from "express";
import { connImportsService } from "./connImports.service.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();

// Daftar tabel hasil import yang boleh diakses user
router.get("/", (req, res) => res.json({ data: connImportsService.list(req.user) }));

router.post("/:id/share", (req, res) => {
  try {
    const m = connImportsService.setSharedWith(req.params.id, req.body?.sharedWith, req.user);
    logActivity(req.user, "share", "table", m.name);
    res.json({ data: m });
  } catch (err) { res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message }); }
});

router.delete("/:id", async (req, res) => {
  try {
    const ok = await connImportsService.remove(req.params.id, req.user);
    if (!ok) return res.status(404).json({ error: "Tabel tidak ditemukan" });
    logActivity(req.user, "delete", "table", req.params.id);
    res.json({ data: { deleted: true } });
  } catch (err) { res.status(403).json({ error: err.message }); }
});

export default router;
