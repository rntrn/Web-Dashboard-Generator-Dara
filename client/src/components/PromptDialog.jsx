import { useState, useEffect, useRef } from "react";
import { useI18n } from "../i18n/I18nContext.jsx";

/**
 * PromptDialog — popup untuk MEMINTA SATU INPUT TEKS dari user sebelum aksi
 * dijalankan (mis. "beri nama dashboard ini sebelum dibuat"). Beda dengan
 * ConfirmDialog (yang cuma minta persetujuan ya/tidak), dialog ini punya
 * kotak input yang wajib diisi.
 *
 * Props:
 *   open         : boolean — tampil/tidak
 *   title        : judul popup
 *   message      : penjelasan singkat (opsional, string atau node)
 *   label        : label di atas input (mis. "Nama dashboard")
 *   defaultValue : nilai awal input (mis. saran nama otomatis, boleh diedit)
 *   placeholder  : placeholder input
 *   confirmLabel : label tombol konfirmasi (default t("common.create"))
 *   busy         : true → tombol menunjukkan proses & input dikunci
 *   onConfirm(value) : dipanggil dengan teks yang sudah di-trim saat dikonfirmasi
 *   onClose      : dipanggil saat batal / tutup
 */
export default function PromptDialog({
  open, title, message, label, defaultValue = "", placeholder = "",
  confirmLabel, busy = false, onConfirm, onClose,
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);
  const resolvedConfirmLabel = confirmLabel ?? t("common.create");

  // Setiap kali popup dibuka ulang, isi ulang dengan saran nama terbaru
  // (mis. tabel yang dipilih berubah) dan fokuskan+pilih teksnya.
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setTimeout(() => inputRef.current?.select(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultValue]);

  if (!open) return null;

  const trimmed = value.trim();
  const canConfirm = !busy && trimmed.length > 0;

  function submit() {
    if (canConfirm) onConfirm(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={busy ? undefined : onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        {message && <div className="text-sm text-gray-600 mt-2">{message}</div>}

        <div className="mt-3">
          {label && <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>}
          <input
            ref={inputRef}
            autoFocus
            disabled={busy}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-300 outline-none disabled:bg-gray-50"
            placeholder={placeholder}
          />
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} disabled={busy}
            className="px-4 py-2 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {t("common.cancel")}
          </button>
          <button onClick={submit} disabled={!canConfirm}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed">
            {busy ? t("common.processing") : resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
