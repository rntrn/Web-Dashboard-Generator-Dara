import { apiFetch } from "./http.js";
/**
 * Charts API — chart tersimpan (metadata DARA).
 */

export const chartsApi = {
  list: async () => {
    const r = await apiFetch("/api/charts");
    if (!r.ok) throw new Error("Gagal memuat chart tersimpan");
    return r.json();
  },

  create: async (spec) => {
    const r = await apiFetch("/api/charts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || "Gagal menyimpan chart");
    return json;
  },

  update: async (id, spec) => {
    const r = await apiFetch(`/api/charts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(spec),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || "Gagal memperbarui chart");
    return json;
  },

  remove: async (id) => {
    const r = await apiFetch(`/api/charts/${id}`, { method: "DELETE" });
    if (!r.ok) throw new Error("Gagal menghapus chart");
    return r.json();
  },

  /** Hapus semua chart yang boleh dikelola user (massal). */
  removeAll: async () => {
    const r = await apiFetch("/api/charts", { method: "DELETE" });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || "Gagal menghapus semua chart");
    return json;
  },
};

export default chartsApi;
