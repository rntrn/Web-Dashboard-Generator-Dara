import { useEffect, useState } from "react";
import { subscribe, ui } from "../lib/uiBus";

/**
 * GlobalUI — elemen UI global:
 *  - Top loading bar (muncul saat ada request API berjalan)
 *  - Toast/popup (info/success/error). Error menampilkan DETAIL teknis
 *    hanya bila mode dev aktif (di-toggle admin).
 *  - Menangkap error tak tertangani (window error + promise rejection).
 */
export default function GlobalUI() {
  const [state, setState] = useState(ui.get());

  useEffect(() => subscribe(setState), []);

  // Tangkap error global -> laporkan (detail hanya tampil saat devMode)
  useEffect(() => {
    const onErr = (e) => ui.reportError("Terjadi error di aplikasi.", e.error || e);
    const onRej = (e) => ui.reportError("Terjadi error (promise).", e.reason || e);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
  }, []);

  const loading = state.loading > 0;

  return (
    <>
      {/* Top loading bar */}
      <div className="fixed top-0 left-0 right-0 z-[9999] h-0.5 pointer-events-none">
        <div className={`h-full bg-gradient-to-r from-teal-400 via-sky-400 to-indigo-400 transition-all duration-300 ${
          loading ? "w-full opacity-100 animate-pulse" : "w-0 opacity-0"
        }`} />
      </div>

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {state.toasts.map((t) => (
          <div key={t.id}
            className={`rounded-xl shadow-lg border p-3 text-sm bg-white animate-[fadeIn_.2s] ${
              t.kind === "error" ? "border-red-200" : t.kind === "success" ? "border-green-200" : "border-gray-200"
            }`}>
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none">
                {t.kind === "error" ? "⚠️" : t.kind === "success" ? "✅" : "ℹ️"}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`font-semibold ${t.kind === "error" ? "text-red-700" : "text-gray-800"}`}>
                  {t.message}
                </p>
                {t.detail && (
                  <pre className="mt-1 text-[10px] text-gray-500 bg-gray-50 rounded p-2 overflow-auto max-h-40 whitespace-pre-wrap">
                    {t.detail}
                  </pre>
                )}
              </div>
              <button onClick={() => ui.dismiss(t.id)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
