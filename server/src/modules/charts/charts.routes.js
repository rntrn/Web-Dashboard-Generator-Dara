/**
 * Charts Routes — endpoint chart tersimpan, di-mount di /api/charts.
 */

import { Router } from "express";
import { chartsController } from "./charts.controller.js";

const router = Router();

router.get("/", chartsController.list);
router.post("/", chartsController.create);
router.post("/:id/share", chartsController.share);
router.put("/:id", chartsController.update);
router.delete("/", chartsController.removeAll);   // hapus massal (sebelum /:id)
router.delete("/:id", chartsController.remove);

export default router;
