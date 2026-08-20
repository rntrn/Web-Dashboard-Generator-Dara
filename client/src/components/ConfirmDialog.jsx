import { useState, useEffect } from "react";

/**
 * ConfirmDialog — dialog konfirmasi aksi berbahaya (mis. hapus).
 *
 * Props:
 *   open      : boolean — tampil/tidak
 *   title     : judul
 *   message   : penjelasan (string atau node)
 *   confirmWord : jika di-set (mis. "HAPUS"), user WAJIB mengetik kata ini
 *                 agar tombol konfirmasi aktif → cegah aksi massal tak sengaja.
 *   confirmLabel : label tombol konfirmasi (default "Hapus")
 *   danger    : true → tombol merah (default true)
 *   busy      : true → tombol menunjukkan proses & nonaktif
 *   onConfirm : dipanggil saat dikonfirmasi
 *   onClose   : dipanggil saat batal / tutup
 */
export default function ConfirmDialog({
  open, title, message, confirmWord = null,
  confirmLabel = "Hapus", danger = true, busy = false, onConfirm, onClose,
}) {
  const [typed, setTyped] = useState("");
  useEffect(() => { if (open) setTyped(""); }, [open]);
  if (!open) return null;

  const needsWord = !!confirmWord;
  const canConfirm = !busy && (!needsWord || typed.trim() === confirmWord);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-600 mt-2">{message}</div>

        {needsWord && (
          <div className="mt-3">
            <label className="block text-xs text-gray-500 mb-1">
              Ketik <span className="font-mono font-bold text-red-600">{confirmWord}</span> untuk mengonfirmasi
            </label>
            <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-300 outline-none"
              placeholder={confirmWord} />
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Batal
          </button>
          <button onClick={onConfirm} disabled={!canConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700"}`}>
            {busy ? "Memproses…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
