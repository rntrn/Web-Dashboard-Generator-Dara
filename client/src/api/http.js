/**
 * apiFetch — pembungkus fetch yang otomatis menyertakan token JWT.
 * Token disimpan di localStorage ("dara_token"), user di "dara_user".
 * Bila server jawab 401 (sesi habis), paksa kembali ke halaman login.
 */

import { ui } from "../lib/uiBus";

export function getToken() {
  return localStorage.getItem("dara_token");
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem("dara_user")); }
  catch { return null; }
}

export function setSession(token, user) {
  localStorage.setItem("dara_token", token);
  localStorage.setItem("dara_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("dara_token");
  localStorage.removeItem("dara_user");
}

export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Loading bar global (kecuali polling ringan yg minta skip)
  const skipLoading = options._skipLoading;
  if (!skipLoading) ui.startLoading();
  try {
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      clearSession();
      window.location.reload();
      throw new Error("Sesi habis");
    }
    return res;
  } finally {
    if (!skipLoading) ui.stopLoading();
  }
}

export default apiFetch;
