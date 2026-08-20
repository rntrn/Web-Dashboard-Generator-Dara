/**
 * Charts Controller — HTTP handler untuk chart tersimpan.
 */

import { chartsService } from "./charts.service.js";
import { logActivity } from "../../lib/activityLog.js";

export const chartsController = {
  /** GET /api/charts — hanya yang boleh diakses user (ACL) */
  list(req, res) {
    try {
      res.json({ data: chartsService.list(req.user) });
    } catch (err) {
      console.error("Error list charts:", err);
      res.status(500).json({ error: "Gagal memuat daftar chart" });
    }
  },

  /** POST /api/charts/:id/share — set daftar NIP (pemilik/admin) */
  share(req, res) {
    try {
      const chart = chartsService.setSharedWith(req.params.id, req.body?.sharedWith, req.user);
      logActivity(req.user, "share", "chart", chart.name);
      res.json({ data: chart });
    } catch (err) {
      res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message });
    }
  },

  /** POST /api/charts — pembuat dicatat dari JWT (req.user) */
  create(req, res) {
    try {
      const chart = chartsService.save(req.body, req.user);
      logActivity(req.user, "create", "chart", chart.name);
      res.status(201).json({ data: chart });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  /** PUT /api/charts/:id — perbarui (pemilik/admin) */
  update(req, res) {
    try {
      const chart = chartsService.update(req.params.id, req.body, req.user);
      res.json({ data: chart });
    } catch (err) {
      res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message });
    }
  },

  /** DELETE /api/charts/:id — hanya pemilik/admin */
  remove(req, res) {
    try {
      const ok = chartsService.remove(req.params.id, req.user);
      if (!ok) return res.status(404).json({ error: "Chart tidak ditemukan" });
      logActivity(req.user, "delete", "chart", req.params.id);
      res.json({ data: { id: req.params.id, deleted: true } });
    } catch (err) {
      res.status(403).json({ error: err.message });
    }
  },

  /** DELETE /api/charts — hapus semua chart yang boleh dikelola user (massal). */
  removeAll(req, res) {
    try {
      const result = chartsService.removeManageable(req.user);
      logActivity(req.user, "delete-all", "chart", `count=${result.deleted}`);
      res.json({ data: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
};

export default chartsController;
