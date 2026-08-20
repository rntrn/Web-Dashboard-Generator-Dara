import { apiFetch } from "./http.js";

/**
 * connImportsApi — mengelola tabel HASIL import Data Connection
 * (dara_data_conn_*): daftar/bagikan/hapus. TIDAK memicu import baru (itu
 * connectionsApi.import, admin-only) — endpoint di sini cuma butuh login
 * biasa, ter-ACL per-item di server (lihat connImports.routes.js).
 */

async function jsonOrThrow(r, fallbackMsg) {
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || fallbackMsg);
  return json;
}

export const connImportsApi = {
  list: async () => jsonOrThrow(await apiFetch("/api/conn-imports"), "Gagal memuat daftar tabel hasil import"),

  setSharedWith: async (id, sharedWith) =>
    jsonOrThrow(
      await apiFetch(`/api/conn-imports/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWith }),
      }),
      "Gagal membagikan tabel"
    ),

  remove: async (id) =>
    jsonOrThrow(await apiFetch(`/api/conn-imports/${id}`, { method: "DELETE" }), "Gagal menghapus tabel"),
};

export default connImportsApi;
