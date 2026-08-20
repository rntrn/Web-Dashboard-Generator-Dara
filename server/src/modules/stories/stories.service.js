/**
 * Stories Service — rangkaian beberapa dashboard jadi satu alur presentasi.
 *
 * Story = nama + langkah berurutan:
 *   { id, name, steps: [{ dashboardId, title, narasi }], createdBy, embedKey }
 * Tiap langkah menampilkan satu dashboard + narasi (teks penjelasan).
 * Urutan array = urutan presentasi (langkah 1, 2, 3...).
 */

import crypto from "crypto";
import { metaStore } from "../../config/metaStore.js";
import { dashboardsService } from "../dashboards/dashboards.service.js";
import { dashboardsRepository } from "../dashboards/dashboards.repository.js";
import { filterAccessible, canManageItem, sanitizeSharedWith } from "../../lib/acl.js";

const COLLECTION = "stories";

/** Validasi payload story. Lempar Error bila tidak valid. */
function validate(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Payload kosong");
  if (!payload.name || !payload.name.trim()) throw new Error("Nama story wajib diisi");

  const rawSteps = payload.steps || [];
  if (!Array.isArray(rawSteps)) throw new Error("steps harus array");

  const dashIds = new Set(dashboardsRepository.list().map((d) => d.id));
  const steps = rawSteps.map((s, i) => {
    if (!s.dashboardId || !dashIds.has(s.dashboardId))
      throw new Error(`Dashboard tidak ditemukan pada langkah ${i + 1}`);
    return {
      id: s.id || `step_${i}_${Date.now()}`,
      dashboardId: s.dashboardId,
      title: String(s.title || "").slice(0, 200),
      narasi: String(s.narasi || "").slice(0, 2000),
    };
  });
  if (steps.length === 0) throw new Error("Story butuh minimal satu langkah");
  return steps;
}

export const storiesService = {
  /** Daftar story yang boleh diakses user (ACL). */
  list(user = null) {
    const all = metaStore.readAll(COLLECTION);
    return user ? filterAccessible(all, user) : all;
  },

  /** Set daftar NIP yang dibagikan (pemilik/admin). */
  setSharedWith(id, nips, user = null) {
    const all = metaStore.readAll(COLLECTION);
    const story = all.find((s) => s.id === id);
    if (!story) throw new Error("Story tidak ditemukan");
    if (!canManageItem(story, user))
      throw new Error("Hanya pembuat atau admin yang boleh membagikan story ini");
    story.sharedWith = sanitizeSharedWith(nips);
    metaStore.writeAll(COLLECTION, all);
    return story;
  },

  get(id) {
    return metaStore.readAll(COLLECTION).find((s) => s.id === id) || null;
  },

  /** Detail story + dashboard tiap langkah (siap render). */
  getWithDashboards(id) {
    const story = this.get(id);
    if (!story) return null;
    return {
      ...story,
      steps: story.steps.map((st) => ({
        ...st,
        dashboard: dashboardsService.getWithCharts(st.dashboardId),
      })),
    };
  },

  _assertCanModify(id, user) {
    const story = this.get(id);
    if (!story) throw new Error("Story tidak ditemukan");
    const isAdmin = user && user.role === "admin";
    const isOwner = user && story.createdBy && story.createdBy.nip === user.nip;
    if (!isAdmin && !isOwner)
      throw new Error("Hanya pembuat atau admin yang boleh mengubah story ini");
    return story;
  },

  create(payload, user = null) {
    const steps = validate(payload);
    const story = {
      id: `story_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: payload.name.trim(),
      steps,
      createdBy: user ? { nip: user.nip, nama: user.nama } : null,
      sharedWith: [], // B1: NIP yang diberi akses oleh pembuat
      createdAt: new Date().toISOString(),
    };
    const all = metaStore.readAll(COLLECTION);
    all.push(story);
    metaStore.writeAll(COLLECTION, all);
    return story;
  },

  update(id, payload, user = null) {
    this._assertCanModify(id, user);
    const steps = validate(payload);
    const all = metaStore.readAll(COLLECTION);
    const idx = all.findIndex((s) => s.id === id);
    all[idx] = { ...all[idx], name: payload.name.trim(), steps, updatedAt: new Date().toISOString() };
    metaStore.writeAll(COLLECTION, all);
    return all[idx];
  },

  remove(id, user = null) {
    this._assertCanModify(id, user);
    const all = metaStore.readAll(COLLECTION);
    const filtered = all.filter((s) => s.id !== id);
    metaStore.writeAll(COLLECTION, filtered);
    return all.length !== filtered.length;
  },

  /** Hapus SEMUA story yang boleh dikelola user (ACL-aware). */
  removeManageable(user = null) {
    const all = metaStore.readAll(COLLECTION);
    const keep = all.filter((s) => !canManageItem(s, user));
    metaStore.writeAll(COLLECTION, keep);
    return { deleted: all.length - keep.length };
  },

  // ---- Embed ----

  regenerateEmbedKey(id, user = null) {
    this._assertCanModify(id, user);
    const embedKey = crypto.randomBytes(16).toString("hex");
    const all = metaStore.readAll(COLLECTION);
    const idx = all.findIndex((s) => s.id === id);
    all[idx].embedKey = embedKey;
    metaStore.writeAll(COLLECTION, all);
    return { id, embedKey };
  },

  /** Validasi kunci embed (constant-time). Return story+dashboards atau null. */
  getForEmbed(id, key) {
    const story = this.get(id);
    if (!story || !story.embedKey || !key) return null;
    const a = Buffer.from(String(story.embedKey));
    const b = Buffer.from(String(key));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return this.getWithDashboards(id);
  },
};

export default storiesService;
