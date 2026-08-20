/**
 * uiBus — pub/sub sederhana untuk state UI global tanpa library:
 *  - loading: jumlah request API aktif (untuk top loading bar)
 *  - toast: notifikasi/error popup
 *  - devMode: apakah mode dev (popup error detail) aktif
 *
 * Dipakai lintas modul (apiFetch, komponen) tanpa context provider.
 */

const listeners = new Set();
let state = { loading: 0, toasts: [], devMode: false };

function emit() {
  for (const l of listeners) l(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const ui = {
  get: () => state,

  startLoading() { state = { ...state, loading: state.loading + 1 }; emit(); },
  stopLoading() { state = { ...state, loading: Math.max(0, state.loading - 1) }; emit(); },

  setDevMode(on) { state = { ...state, devMode: !!on }; emit(); },

  /** Tambah toast. kind: "error" | "info" | "success". detail hanya tampil di devMode. */
  toast(message, { kind = "info", detail = null, timeout = 5000 } = {}) {
    const id = Date.now() + Math.random();
    state = { ...state, toasts: [...state.toasts, { id, message, kind, detail }] };
    emit();
    if (timeout) setTimeout(() => ui.dismiss(id), timeout);
    return id;
  },

  dismiss(id) {
    state = { ...state, toasts: state.toasts.filter((t) => t.id !== id) };
    emit();
  },

  /**
   * Laporkan error. Selalu tampilkan pesan ramah; DETAIL teknis hanya muncul
   * (di toast) bila devMode aktif — sesuai permintaan (popup saat dev diaktifkan).
   */
  reportError(friendly, error) {
    const detail = error ? (error.stack || error.message || String(error)) : null;
    ui.toast(friendly, { kind: "error", detail: state.devMode ? detail : null, timeout: state.devMode ? 12000 : 5000 });
    // Selalu log ke console untuk jejak.
    if (error) console.error(friendly, error);
  },
};

export default ui;
