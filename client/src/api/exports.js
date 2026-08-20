/**
 * exports API — unduh bundel skrip (.zip) dashboard/story.
 *
 * Berbeda dari endpoint JSON biasa: respons berupa file biner. Kita ambil
 * sebagai Blob (dengan header JWT) lalu picu unduhan di browser.
 */

import { apiFetch } from "./http";

/**
 * Unduh bundel ekspor.
 * @param {"dashboard"|"story"} kind
 * @param {string} id
 * @param {"html"|"php"|"react"|"ci3"} format
 * @param {"hardcode"|"db"} [mode] hanya relevan untuk format "react"/"ci3"
 */
export async function downloadExport(kind, id, format, mode) {
  const qs = mode ? `?format=${format}&mode=${mode}` : `?format=${format}`;
  const res = await apiFetch(`/api/exports/${kind}/${id}${qs}`);
  if (!res.ok) {
    // Server mengirim JSON error untuk kasus 403/404/500.
    let msg = "Gagal mengekspor";
    try { msg = (await res.json()).error || msg; } catch { /* biarkan default */ }
    throw new Error(msg);
  }

  // Ambil nama file dari header, fallback aman.
  const cd = res.headers.get("Content-Disposition") || "";
  const m = cd.match(/filename="?([^"]+)"?/);
  const filename = m ? m[1] : `dara-${kind}-${format}.zip`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default { downloadExport };
