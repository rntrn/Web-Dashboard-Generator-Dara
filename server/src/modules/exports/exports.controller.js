/**
 * Exports Controller — handler HTTP untuk unduh bundel .zip.
 *
 * Akses: pengguna harus BOLEH membuka item (ACL: admin/pemilik/dibagikan).
 * Data yang keluar hanya snapshot contoh (dibatasi di service).
 */

import { exportsService } from "./exports.service.js";
import { canAccessItem } from "../../lib/acl.js";
import { logActivity } from "../../lib/activityLog.js";

/** Kirim buffer sebagai unduhan zip. */
function sendZip(res, filename, buffer) {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}

export const exportsController = {
  /** GET /api/exports/dashboard/:id?format=html|php|react|ci3|ci4&mode=hardcode|db */
  async dashboard(req, res) {
    try {
      const entity = exportsService.resolveDashboard(req.params.id);
      if (!entity) return res.status(404).json({ error: "Dashboard tidak ditemukan" });
      if (!canAccessItem(entity, req.user))
        return res.status(403).json({ error: "Tidak punya akses ke dashboard ini" });

      const { filename, buffer } = await exportsService.buildZip(
        "dashboard", entity, req.query.format, req.query.mode);
      logActivity(req.user, "export", `dashboard:${entity.id}`,
        `${req.query.format || "html"}${req.query.mode ? ":" + req.query.mode : ""}`);
      sendZip(res, filename, buffer);
    } catch (err) {
      console.error("Export dashboard gagal:", err);
      res.status(500).json({ error: "Gagal membuat bundel ekspor" });
    }
  },

  /** GET /api/exports/story/:id?format=html|php|react|ci3|ci4&mode=hardcode|db */
  async story(req, res) {
    try {
      const entity = exportsService.resolveStory(req.params.id);
      if (!entity) return res.status(404).json({ error: "Story tidak ditemukan" });
      if (!canAccessItem(entity, req.user))
        return res.status(403).json({ error: "Tidak punya akses ke story ini" });

      const { filename, buffer } = await exportsService.buildZip(
        "story", entity, req.query.format, req.query.mode);
      logActivity(req.user, "export", `story:${entity.id}`,
        `${req.query.format || "html"}${req.query.mode ? ":" + req.query.mode : ""}`);
      sendZip(res, filename, buffer);
    } catch (err) {
      console.error("Export story gagal:", err);
      res.status(500).json({ error: "Gagal membuat bundel ekspor" });
    }
  },
};

export default exportsController;
