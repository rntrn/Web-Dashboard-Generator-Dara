import { apiFetch, getToken, clearSession } from "./http";

/** API unggah CSV/Excel → tabel (v0.28.0). */
export const uploadsApi = {
  status: async () => (await apiFetch("/api/uploads/status")).json(),
  list: async () => (await apiFetch("/api/uploads")).json(),

  /**
   * Kirim tabel hasil parse ke server.
   *
   * `onProgress(percent)` opsional — dipanggil berkala (0-100) selama body
   * dikirim. Dipakai untuk bar persen ASLI di ProgressDialog. Butuh
   * XMLHttpRequest (bukan fetch) karena fetch belum punya event progres
   * upload di semua browser — apiFetch (berbasis fetch) tidak bisa dipakai
   * di sini, jadi header Authorization ditambahkan manual, meniru apiFetch.
   */
  create: (body, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/uploads");
      xhr.setRequestHeader("Content-Type", "application/json");
      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }

      xhr.onload = () => {
        let j = {};
        try { j = JSON.parse(xhr.responseText || "{}"); } catch { /* respons bukan JSON */ }
        if (xhr.status === 401) { clearSession(); window.location.reload(); return; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(j);
        else reject(new Error(j.error || "Gagal mengunggah"));
      };
      xhr.onerror = () => reject(new Error("Gagal terhubung ke server (periksa koneksi)."));

      xhr.send(JSON.stringify(body));
    }),

  remove: async (id) => {
    const r = await apiFetch(`/api/uploads/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error);
    return j;
  },
};

export default uploadsApi;
