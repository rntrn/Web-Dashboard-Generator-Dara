/**
 * Databases Routes
 * Express router for schema introspection endpoints
 */

import { Router } from "express";
import { databasesController } from "./databases.controller.js";

const router = Router();

router.get("/tables", databasesController.listTables);
router.get("/tables/:table/schema", databasesController.getSchema);

export default router;
