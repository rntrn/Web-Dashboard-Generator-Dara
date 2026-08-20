/**
 * Dashboards Routes — /api/dashboards
 */

import { Router } from "express";
import { dashboardsController } from "./dashboards.controller.js";
import { dashboardsService } from "./dashboards.service.js";

const router = Router();

router.get("/", dashboardsController.list);
router.post("/auto", dashboardsController.auto); // sebelum "/:id" agar tak tertangkap
router.get("/:id", dashboardsController.get);
router.post("/:id/share", dashboardsController.share);
router.post("/", dashboardsController.create);
router.put("/:id", dashboardsController.update);
router.delete("/", dashboardsController.removeAll); // hapus massal (sebelum /:id)
router.delete("/:id", dashboardsController.remove);

// Buat/putar-ulang kunci embed (pemilik/admin). Kunci lama langsung mati.
router.post("/:id/embed-key", (req, res) => {
  try {
    res.json({ data: dashboardsService.regenerateEmbedKey(req.params.id, req.user) });
  } catch (err) {
    res.status(403).json({ error: err.message });
  }
});

export default router;
