import { useEffect, useRef, useState } from "react";
import { Notice } from "./ui";
import { useI18n } from "../i18n/I18nContext.jsx";

/**
 * ProgressDialog — popup progres untuk proses yang butuh waktu (unggah file,
 * pembuatan dashboard otomatis, dll). Menampilkan bar persen + status teks,
 * dan kalau gagal, pesan error jelas + tombol tutup/coba lagi.
 *
 * DUA MODE PERSEN:
 *  1. Persen ASLI (simulate=false, default) — Anda kontrol penuh lewat prop
 *     `percent` (0-100), biasanya dari event onprogress request jaringan
 *     (lihat uploadsApi.create di api/uploads.js). Ini yang dipakai untuk
 *     UNGGAH FILE, karena ukurannya diketahui pasti.
 *  2. Persen SIMULASI (simulate=true) — dipakai untuk proses yang TIDAK
 *     punya cara mengukur progres asli (mis. "buat dashboard otomatis" =
 *     satu request server yang baru selesai sekaligus, bukan bertahap).
 *     Progress bar berjalan sendiri mendekati 90% lalu berhenti menunggu,
 *     baru lompat ke 100% begitu server benar-benar selesai (phase="done").
 *     Ini pola umum ("skeleton progress") supaya user tahu aplikasi masih
 *     bekerja, BUKAN ukuran kemajuan sesungguhnya — jujur ditandai di teks
 *     status kalau simulate=true (lihat statusText di pemanggil).
 *
 * Props:
 *   open        : boolean
 *   title       : judul popup (mis. "Mengunggah data…")
 *   phase       : "running" | "done" | "error"
 *   percent     : 0-100 (dipakai bila simulate=false)
 *   simulate    : true → animasikan persen sendiri (lihat catatan di atas)
 *   statusText  : teks status di bawah judul saat phase="running"
 *   successText : teks saat phase="done"
 *   errorText   : teks saat phase="error"
 *   onClose     : tutup popup (aktif saat done/error, atau selalu bila allowCloseWhileRunning)
 *   onRetry     : opsional — tombol "Coba lagi" saat phase="error"
 *   allowCloseWhileRunning : izinkan tutup manual saat masih berjalan (default false)
 */
export default function ProgressDialog({
  open, title, phase = "running", percent = 0, simulate = false,
  statusText = "", successText = "", errorText = "",
  onClose, onRetry, allowCloseWhileRunning = false,
}) {
  const { t } = useI18n();
  const [simPercent, setSimPercent] = useState(0);
  const timerRef = useRef(null);

  // Reset & jalankan animasi simulasi setiap popup dibuka ulang untuk proses baru.
  useEffect(() => {
    if (!open || !simulate) return;
    if (phase !== "running") return;
    setSimPercent(0);
    timerRef.current = setInterval(() => {
      // Mendekati 90% dengan langkah yang makin kecil (asimtotik) — tidak
      // pernah menyentuh 100% sendiri, supaya tidak "bohong" selesai duluan.
      setSimPercent((p) => (p >= 90 ? p : p + (90 - p) * 0.12 + 0.5));
    }, 200);
    return () => clearInterval(timerRef.current);
  }, [open, simulate, phase]);

  // Begitu phase jadi "done", lompat langsung ke 100%.
  useEffect(() => {
    if (phase === "done") {
      clearInterval(timerRef.current);
      setSimPercent(100);
    }
  }, [phase]);

  if (!open) return null;

  const shownPercent = Math.round(simulate ? simPercent : percent);
  const canClose = phase !== "running" || allowCloseWhileRunning;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={canClose ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          {phase === "running" && (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-teal-500 border-t-transparent shrink-0" />
          )}
          {phase === "done" && <span className="text-lg leading-none">✅</span>}
          {phase === "error" && <span className="text-lg leading-none">⚠️</span>}
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
        </div>

        {phase === "running" && (
          <>
            <p className="text-xs text-gray-500 mb-3">{statusText}</p>
            <div className="w-full h-2.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-teal-400 via-sky-400 to-indigo-400 transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, shownPercent))}%` }}
              />
            </div>
            <p className="text-right text-xs font-mono text-gray-400 mt-1">{shownPercent}%</p>
          </>
        )}

        {phase === "done" && (
          <div className="mt-2"><Notice kind="success">{successText}</Notice></div>
        )}

        {phase === "error" && (
          <div className="mt-2"><Notice kind="error">{errorText}</Notice></div>
        )}

        {phase !== "running" && (
          <div className="flex justify-end gap-2 mt-4">
            {phase === "error" && onRetry && (
              <button onClick={onRetry}
                className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50">
                {t("common.retry")}
              </button>
            )}
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700">
              {t("common.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
