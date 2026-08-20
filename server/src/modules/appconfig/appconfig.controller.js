/** Appconfig controller DARA: GET publik, PUT admin. */
import { appconfigService } from "./appconfig.service.js";

export const appconfigController = {
  get(req, res) {
    try { res.json({ data: appconfigService.get() }); }
    catch { res.status(500).json({ error: "Gagal memuat konfigurasi" }); }
  },
  update(req, res) {
    try { res.json({ data: appconfigService.update(req.body, req.user) }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  },
};

export default appconfigController;
