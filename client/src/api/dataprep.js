import { apiFetch } from "./http.js";

/**
 * dataprepApi — Data Preparation Fase 2 (admin-only: rakit & simpan
 * recipe). Mengelola tabel HASIL-nya (list/share/delete) ada di
 * dataprepTablesApi di bawah — endpoint beda, ACL beda (lihat
 * server/src/modules/dataprep/*.routes.js).
 */

async function jsonOrThrow(r, fallbackMsg) {
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || fallbackMsg);
  return json;
}

export const dataprepApi = {
  relations: async (table) =>
    jsonOrThrow(await apiFetch(`/api/dataprep/relations/${encodeURIComponent(table)}`), "Gagal memuat saran relasi"),

  preview: async (recipe) =>
    jsonOrThrow(
      await apiFetch("/api/dataprep/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe }),
      }),
      "Gagal memuat pratinjau"
    ),

  save: async (recipe, name, rowLimit) =>
    jsonOrThrow(
      await apiFetch("/api/dataprep/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe, name, rowLimit }),
      }),
      "Gagal menyimpan tabel"
    ),
};

export const dataprepTablesApi = {
  list: async () => jsonOrThrow(await apiFetch("/api/dataprep-tables"), "Gagal memuat daftar tabel Data Preparation"),

  setSharedWith: async (id, sharedWith) =>
    jsonOrThrow(
      await apiFetch(`/api/dataprep-tables/${id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWith }),
      }),
      "Gagal membagikan tabel"
    ),

  remove: async (id) =>
    jsonOrThrow(await apiFetch(`/api/dataprep-tables/${id}`, { method: "DELETE" }), "Gagal menghapus tabel"),
};

export default dataprepApi;
