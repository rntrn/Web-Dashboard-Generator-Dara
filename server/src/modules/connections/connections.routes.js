/**
 * Connections Routes — /api/connections (login + admin, di-mount di app.js
 * dengan requireAuth; requireAdmin diterapkan di sini karena SELURUH modul
 * ini sensitif — kredensial database eksternal).
 */

import { Router } from "express";
import { connectionsService } from "./connections.service.js";
import { connImportsService } from "./connImports.service.js";
import { requireAdmin } from "../../middlewares/auth.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();
router.use(requireAdmin);

router.get("/drivers", (req, res) => {
  res.json({ data: connectionsService.listDrivers() });
});

router.get("/", (req, res) => {
  res.json({ data: connectionsService.list() });
});

router.get("/:id", (req, res) => {
  const c = connectionsService.get(req.params.id);
  if (!c) return res.status(404).json({ error: "Koneksi tidak ditemukan" });
  res.json({ data: c });
});

router.post("/", (req, res) => {
  try {
    const c = connectionsService.create(req.body || {}, req.user);
    logActivity(req.user, "create", "connection", c.nama);
    res.status(201).json({ data: c });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", (req, res) => {
  try {
    const c = connectionsService.update(req.params.id, req.body || {});
    logActivity(req.user, "update", "connection", c.nama);
    res.json({ data: c });
  } catch (err) {
    res.status(/tidak ditemukan/.test(err.message) ? 404 : 400).json({ error: err.message });
  }
});

router.delete("/:id", (req, res) => {
  const ok = connectionsService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: "Koneksi tidak ditemukan" });
  logActivity(req.user, "delete", "connection", req.params.id);
  res.json({ data: { deleted: true } });
});

router.post("/:id/test", async (req, res) => {
  try {
    const result = await connectionsService.test(req.params.id);
    logActivity(req.user, "test", "connection", req.params.id + (result.ok ? " (berhasil)" : " (gagal)"));
    res.json({ data: result });
  } catch (err) {
    res.status(/tidak ditemukan/.test(err.message) ? 404 : 400).json({ error: err.message });
  }
});

router.get("/:id/tables", async (req, res) => {
  try {
    const tables = await connectionsService.listTables(req.params.id);
    res.json({ data: tables });
  } catch (err) {
    res.status(/tidak ditemukan/.test(err.message) ? 404 : 400).json({ error: err.message });
  }
});

router.get("/:id/tables/:table/preview", async (req, res) => {
  try {
    const preview = await connectionsService.previewRows(req.params.id, req.params.table, req.query.limit);
    res.json({ data: preview });
  } catch (err) {
    res.status(/tidak ditemukan/.test(err.message) ? 404 : 400).json({ error: err.message });
  }
});

// Fase 1 — import/materialize: tarik baris dari koneksi eksternal, simpan
// jadi tabel baru dara_data_conn_* di database DARA sendiri (lihat
// connImports.service.js). SENGAJA admin-only (di sini, bukan di
// connImports.routes.js) karena aksi ini membuka koneksi ke kredensial
// eksternal sungguhan — beda dari mengelola tabel HASIL-nya yang sudah
// tidak menyentuh kredensial apa pun.
router.post("/:id/import", async (req, res) => {
  try {
    const meta = await connImportsService.importTable(
      { connectionId: req.params.id, sourceTable: req.body?.table, name: req.body?.name },
      req.user
    );
    logActivity(req.user, "import", "connection-table", `${meta.name} (${meta.sourceTable})`);
    res.status(201).json({ data: meta });
  } catch (err) {
    res.status(/tidak ditemukan/.test(err.message) ? 404 : 400).json({ error: err.message });
  }
});

export default router;
