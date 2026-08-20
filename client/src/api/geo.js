/**
 * Geo API — deteksi tabel peta + ambil fitur GeoJSON layer.
 */
import { apiFetch } from "./http.js";

async function j(r, msg) {
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || msg);
  return json;
}

function qs(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) if (v != null && v !== "") p.set(k, v);
  return p.toString();
}

export const geoApi = {
  tables: async () => j(await apiFetch("/api/geo/tables"), "Gagal deteksi tabel peta"),

  area: async (table, { geoColumn, value, label, filters }) =>
    j(await apiFetch(`/api/geo/${table}/area?${qs({ geoColumn, value, label, filters: filters ? JSON.stringify(filters) : "" })}`),
      "Gagal memuat layer area"),

  point: async (table, { lat, lng, value, label, category, filters }) =>
    j(await apiFetch(`/api/geo/${table}/point?${qs({ lat, lng, value, label, category, filters: filters ? JSON.stringify(filters) : "" })}`),
      "Gagal memuat layer titik"),
};

export default geoApi;
