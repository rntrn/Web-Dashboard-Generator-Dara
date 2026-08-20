/**
 * Dashboards Controller — HTTP handler dashboard.
 */

import { dashboardsService } from "./dashboards.service.js";
import { canAccessItem } from "../../lib/acl.js";
import { logActivity } from "../../lib/activityLog.js";

export const dashboardsController = {
  /** GET /api/dashboards — hanya yang boleh diakses user (ACL) */
  list(req, res) {
    try {
      res.json({ data: dashboardsService.list(req.user) });
    } catch (err) {
      console.error("Error list dashboards:", err);
      res.status(500).json({ error: "Gagal memuat dashboard" });
    }
  },

  /** GET /api/dashboards/:id — termasuk spesifikasi chart tiap item */
  get(req, res) {
    try {
      const dash = dashboardsService.getWithCharts(req.params.id);
      // 404 (bukan 403) bila tak berhak — jangan bocorkan keberadaannya.
      if (!dash || !canAccessItem(dash, req.user))
        return res.status(404).json({ error: "Dashboard tidak ditemukan" });
      res.json({ data: dash });
    } catch (err) {
      console.error("Error get dashboard:", err);
      res.status(500).json({ error: "Gagal memuat dashboard" });
    }
  },

  /** POST /api/dashboards/:id/share — set daftar NIP (pemilik/admin) */
  share(req, res) {
    try {
      const d = dashboardsService.setSharedWith(req.params.id, req.body?.sharedWith, req.user);
      logActivity(req.user, "share", "dashboard", d.name);
      res.json({ data: d });
    } catch (err) {
      res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message });
    }
  },

  /** POST /api/dashboards/auto — buat dashboard otomatis dari usulan tabel */
  async auto(req, res) {
    try {
      const { table, name } = req.body || {};
      const { dashboard, chartCount } = await dashboardsService.autoBuild(table, req.user, name);
      logActivity(req.user, "create", "dashboard", `auto:${dashboard.name}`);
      res.status(201).json({ data: { dashboard, chartCount } });
    } catch (err) {
      console.error("Auto-dashboard gagal:", err);
      res.status(400).json({ error: err.message });
    }
  },

  /** POST /api/dashboards — pembuat dari JWT */
  create(req, res) {
    try {
      const d = dashboardsService.create(req.body, req.user);
      logActivity(req.user, "create", "dashboard", d.name);
      res.status(201).json({ data: d });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  /** PUT /api/dashboards/:id — pemilik/admin */
  update(req, res) {
    try {
      res.json({ data: dashboardsService.update(req.params.id, req.body, req.user) });
    } catch (err) {
      res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message });
    }
  },

  /** DELETE /api/dashboards/:id — pemilik/admin */
  remove(req, res) {
    try {
      const ok = dashboardsService.remove(req.params.id, req.user);
      if (!ok) return res.status(404).json({ error: "Dashboard tidak ditemukan" });
      logActivity(req.user, "delete", "dashboard", req.params.id);
      res.json({ data: { id: req.params.id, deleted: true } });
    } catch (err) {
      res.status(403).json({ error: err.message });
    }
  },

  /** DELETE /api/dashboards — hapus semua dashboard yang boleh dikelola user. */
  removeAll(req, res) {
    try {
      const result = dashboardsService.removeManageable(req.user);
      logActivity(req.user, "delete-all", "dashboard", `count=${result.deleted}`);
      res.json({ data: result });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
};

export default dashboardsController;
