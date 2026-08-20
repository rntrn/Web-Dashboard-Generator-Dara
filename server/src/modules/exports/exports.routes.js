/**
 * Exports Routes — unduh dashboard/story sebagai bundel skrip (.zip).
 * Dimount di app.js: app.use("/api/exports", requireAuth, exportsRoutes).
 *
 *   GET /api/exports/dashboard/:id?format=html|php|react|ci3|ci4&mode=hardcode|db
 *   GET /api/exports/story/:id?format=html|php|react|ci3|ci4&mode=hardcode|db
 *
 * `mode` cuma relevan utk format "react"/"ci3"/"ci4" (default "hardcode" bila
 * tak diisi): "hardcode" = data snapshot dibakar ke kode, jalan tanpa setelan
 * DB apapun. "db" = bundel menyertakan (react) mini-backend Node standalone,
 * atau (ci3/ci4) model dgn SQL live yang jalan lewat koneksi DB CodeIgniter
 * milik user sendiri. ci3 & ci4 BEDA struktur folder (lihat templates-ci3.js
 * vs templates-ci4.js) — bukan cuma versi angka berbeda.
 */

import { Router } from "express";
import { exportsController } from "./exports.controller.js";

const router = Router();

router.get("/dashboard/:id", exportsController.dashboard);
router.get("/story/:id", exportsController.story);

export default router;
