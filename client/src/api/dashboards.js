import { apiFetch } from "./http.js";
/**
 * Dashboards API — CRUD dashboard (metadata DARA).
 */

async function jsonOrThrow(r, fallbackMsg) {
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || fallbackMsg);
  return json;
}

export const dashboardsApi = {
  list: async () => jsonOrThrow(await apiFetch("/api/dashboards"), "Gagal memuat dashboard"),

  get: async (id) => jsonOrThrow(await apiFetch(`/api/dashboards/${id}`), "Gagal memuat dashboard"),

  create: async (payload) =>
    jsonOrThrow(
      await apiFetch("/api/dashboards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      "Gagal menyimpan dashboard"
    ),

  update: async (id, payload) =>
    jsonOrThrow(
      await apiFetch(`/api/dashboards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      "Gagal memperbarui dashboard"
    ),

  remove: async (id) =>
    jsonOrThrow(await apiFetch(`/api/dashboards/${id}`, { method: "DELETE" }), "Gagal menghapus"),

  /** Hapus semua dashboard yang boleh dikelola user (massal). */
  removeAll: async () =>
    jsonOrThrow(await apiFetch("/api/dashboards", { method: "DELETE" }), "Gagal menghapus semua dashboard"),

  /** Buat dashboard otomatis dari usulan chart sebuah tabel. `name` opsional — kosong = server pakai nama bawaan "Auto: <tabel>". */
  auto: async (table, name) =>
    jsonOrThrow(
      await apiFetch("/api/dashboards/auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, name }),
      }),
      "Gagal membuat dashboard otomatis"
    ),
};

export default dashboardsApi;
