/**
 * Geo Routes — /api/geo (wajib login).
 *  GET /tables                         -> daftar tabel geo (area/point)
 *  GET /:table/area?geoColumn=&value=&label=&filters=
 *  GET /:table/point?lat=&lng=&value=&label=&category=&filters=
 * filters = JSON [{column,value}] (opsional).
 */

import { Router } from "express";
import { geoService } from "./geo.service.js";

const router = Router();
const SAFE = /^[A-Za-z0-9_]+$/;

function parseFilters(q) {
  try {
    const arr = JSON.parse(q || "[]");
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => SAFE.test(f.column || "") &&
        (typeof f.value === "string" || typeof f.value === "number") &&
        String(f.value).length <= 200)
      .map((f) => ({ column: f.column, value: f.value }));
  } catch { return []; }
}

router.get("/tables", async (req, res) => {
  try {
    res.json({ data: await geoService.detectTables() });
  } catch (err) {
    console.error("Error geo tables:", err);
    res.status(500).json({ error: "Gagal mendeteksi tabel peta" });
  }
});

router.get("/:table/area", async (req, res) => {
  try {
    const { table } = req.params;
    const { geoColumn, value, label } = req.query;
    if (![table, geoColumn].every(SAFE.test.bind(SAFE)))
      return res.status(400).json({ error: "Parameter tidak valid" });
    if (value && !SAFE.test(value)) return res.status(400).json({ error: "value tidak valid" });
    if (label && !SAFE.test(label)) return res.status(400).json({ error: "label tidak valid" });

    const fc = await geoService.areaFeatures(table, {
      geoColumn, valueColumn: value || null, labelColumn: label || null,
      filters: parseFilters(req.query.filters),
    });
    res.json({ data: fc });
  } catch (err) {
    console.error("Error area features:", err);
    res.status(500).json({ error: "Gagal memuat layer area" });
  }
});

router.get("/:table/point", async (req, res) => {
  try {
    const { table } = req.params;
    const { lat, lng, value, label, category } = req.query;
    if (![table, lat, lng].every(SAFE.test.bind(SAFE)))
      return res.status(400).json({ error: "Parameter tidak valid" });
    for (const v of [value, label, category]) if (v && !SAFE.test(v))
      return res.status(400).json({ error: "Kolom tidak valid" });

    const fc = await geoService.pointFeatures(table, {
      latColumn: lat, lngColumn: lng,
      valueColumn: value || null, labelColumn: label || null, categoryColumn: category || null,
      filters: parseFilters(req.query.filters),
    });
    res.json({ data: fc });
  } catch (err) {
    console.error("Error point features:", err);
    res.status(500).json({ error: "Gagal memuat layer titik" });
  }
});

export default router;
