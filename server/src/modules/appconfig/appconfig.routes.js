/**
 * Appconfig routes DARA.
 *   GET /api/appconfig  -> PUBLIK (login page & shell butuh identitas/tema)
 *   PUT /api/appconfig  -> admin
 */
import { Router } from "express";
import { appconfigController } from "./appconfig.controller.js";
import { requireAuth, requireAdmin } from "../../middlewares/auth.js";

const router = Router();
router.get("/", appconfigController.get);
router.put("/", requireAuth, requireAdmin, appconfigController.update);

export default router;
