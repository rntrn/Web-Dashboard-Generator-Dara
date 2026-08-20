/**
 * Stories Routes — /api/stories (wajib login).
 * Embed publik story ada di modul embed (/api/embed/story/:id).
 */

import { Router } from "express";
import { storiesService } from "./stories.service.js";
import { canAccessItem } from "../../lib/acl.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();

router.get("/", (req, res) => res.json({ data: storiesService.list(req.user) }));

router.get("/:id", (req, res) => {
  const s = storiesService.getWithDashboards(req.params.id);
  if (!s || !canAccessItem(s, req.user)) return res.status(404).json({ error: "Story tidak ditemukan" });
  res.json({ data: s });
});

router.post("/:id/share", (req, res) => {
  try {
    const s = storiesService.setSharedWith(req.params.id, req.body?.sharedWith, req.user);
    logActivity(req.user, "share", "story", s.name);
    res.json({ data: s });
  } catch (err) { res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message }); }
});

router.post("/", (req, res) => {
  try {
    const s = storiesService.create(req.body, req.user);
    logActivity(req.user, "create", "story", s.name);
    res.status(201).json({ data: s });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.put("/:id", (req, res) => {
  try { res.json({ data: storiesService.update(req.params.id, req.body, req.user) }); }
  catch (err) { res.status(/pembuat|admin/.test(err.message) ? 403 : 400).json({ error: err.message }); }
});

// Hapus massal (sebelum "/:id"): semua story yang boleh dikelola user.
router.delete("/", (req, res) => {
  try {
    const result = storiesService.removeManageable(req.user);
    logActivity(req.user, "delete-all", "story", `count=${result.deleted}`);
    res.json({ data: result });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete("/:id", (req, res) => {
  try {
    const ok = storiesService.remove(req.params.id, req.user);
    if (!ok) return res.status(404).json({ error: "Story tidak ditemukan" });
    logActivity(req.user, "delete", "story", req.params.id);
    res.json({ data: { deleted: true } });
  } catch (err) { res.status(403).json({ error: err.message }); }
});

router.post("/:id/embed-key", (req, res) => {
  try { res.json({ data: storiesService.regenerateEmbedKey(req.params.id, req.user) }); }
  catch (err) { res.status(403).json({ error: err.message }); }
});

export default router;
