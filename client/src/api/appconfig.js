/** API identitas/tema aplikasi DARA (global, diatur admin). */
import { apiFetch } from "./http";

async function jsonOrThrow(r, msg) {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || msg);
  return j;
}

export const appconfigApi = {
  /** Publik: identitas/tema untuk diterapkan ke UI. */
  get: async () => jsonOrThrow(await apiFetch("/api/appconfig", { _skipLoading: true }), "Gagal memuat konfigurasi"),
  /** Admin: simpan perubahan. */
  update: async (patch) => jsonOrThrow(
    await apiFetch("/api/appconfig", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    }), "Gagal menyimpan konfigurasi"),
};

export default appconfigApi;
