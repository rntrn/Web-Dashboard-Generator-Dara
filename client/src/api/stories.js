/**
 * Stories API — rangkaian dashboard jadi presentasi.
 */
import { apiFetch } from "./http.js";

async function j(r, msg) {
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || msg);
  return json;
}

export const storiesApi = {
  list: async () => j(await apiFetch("/api/stories"), "Gagal memuat story"),
  get: async (id) => j(await apiFetch(`/api/stories/${id}`), "Gagal memuat story"),
  create: async (p) => j(await apiFetch("/api/stories", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
  }), "Gagal menyimpan story"),
  update: async (id, p) => j(await apiFetch(`/api/stories/${id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p),
  }), "Gagal memperbarui story"),
  remove: async (id) => j(await apiFetch(`/api/stories/${id}`, { method: "DELETE" }), "Gagal menghapus"),
  removeAll: async () => j(await apiFetch("/api/stories", { method: "DELETE" }), "Gagal menghapus semua story"),
  embedKey: async (id) => j(await apiFetch(`/api/stories/${id}/embed-key`, { method: "POST" }), "Gagal membuat kunci"),
};

export default storiesApi;
