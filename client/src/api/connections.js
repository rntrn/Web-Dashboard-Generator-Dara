import { apiFetch } from "./http.js";

/** Connections API — menu "Data Connection" (koneksi database eksternal, khusus admin). */

async function jsonOrThrow(r, fallbackMsg) {
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || fallbackMsg);
  return json;
}

export const connectionsApi = {
  listDrivers: async () => jsonOrThrow(await apiFetch("/api/connections/drivers"), "Gagal memuat daftar driver"),

  list: async () => jsonOrThrow(await apiFetch("/api/connections"), "Gagal memuat daftar koneksi"),

  get: async (id) => jsonOrThrow(await apiFetch(`/api/connections/${id}`), "Gagal memuat koneksi"),

  create: async (body) =>
    jsonOrThrow(
      await apiFetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      "Gagal menyimpan koneksi"
    ),

  update: async (id, body) =>
    jsonOrThrow(
      await apiFetch(`/api/connections/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      "Gagal memperbarui koneksi"
    ),

  remove: async (id) =>
    jsonOrThrow(await apiFetch(`/api/connections/${id}`, { method: "DELETE" }), "Gagal menghapus koneksi"),

  test: async (id) =>
    jsonOrThrow(await apiFetch(`/api/connections/${id}/test`, { method: "POST" }), "Gagal menguji koneksi"),

  listTables: async (id) =>
    jsonOrThrow(await apiFetch(`/api/connections/${id}/tables`), "Gagal memuat daftar tabel"),

  previewRows: async (id, table, limit = 50) =>
    jsonOrThrow(
      await apiFetch(`/api/connections/${id}/tables/${encodeURIComponent(table)}/preview?limit=${limit}`),
      "Gagal memuat pratinjau data"
    ),

  /**
   * Fase 1 — import/materialize: tarik baris tabel `table` dari koneksi
   * `id`, simpan sebagai tabel baru `dara_data_conn_*` (lihat
   * connImports.service.js). Admin-only di server (nested di bawah
   * requireAdmin connections.routes.js) — beda dari connImportsApi yang
   * mengelola tabel HASIL-nya (lihat api/connImports.js).
   */
  import: async (id, { table, name }) =>
    jsonOrThrow(
      await apiFetch(`/api/connections/${id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, name }),
      }),
      "Gagal mengimpor tabel"
    ),
};

export default connectionsApi;
