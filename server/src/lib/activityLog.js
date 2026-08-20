/**
 * activityLog — log penggunaan sederhana (append-only, disimpan di metaStore).
 *
 * Mencatat aksi penting: login, buat/ubah/hapus/bagikan chart/dashboard/story,
 * (dan bisa diperluas). Dibatasi MAX entri terbaru agar file tak membengkak.
 */

import { metaStore } from "../config/metaStore.js";

const COLLECTION = "activity";
const MAX = 2000; // simpan N entri terbaru

/**
 * Catat satu aktivitas. Aman dipanggil "fire-and-forget" (tak melempar).
 * @param {object} user  req.user (punya nip, nama, role) — boleh null
 * @param {string} action  mis. "login" | "create" | "update" | "delete" | "share"
 * @param {string} target  mis. "dashboard" | "chart" | "story"
 * @param {string} [detail] keterangan singkat (nama/ id item)
 */
export function logActivity(user, action, target, detail = "") {
  try {
    const all = metaStore.readAll(COLLECTION);
    all.push({
      ts: new Date().toISOString(),
      nip: user?.nip || "-",
      nama: user?.nama || null,
      role: user?.role || null,
      action,
      target,
      detail: String(detail).slice(0, 200),
    });
    // simpan hanya MAX terbaru
    metaStore.writeAll(COLLECTION, all.slice(-MAX));
  } catch { /* logging tak boleh mengganggu alur utama */ }
}

/** Daftar aktivitas terbaru (default 200), terbaru dulu. */
export function listActivity(limit = 200) {
  const all = metaStore.readAll(COLLECTION);
  return all.slice(-Math.min(limit, MAX)).reverse();
}

export default { logActivity, listActivity };
