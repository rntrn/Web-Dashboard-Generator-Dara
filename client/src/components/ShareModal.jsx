import { useEffect, useState } from "react";
import { apiFetch } from "../api/http";
import { Spinner } from "./Loader";

/**
 * ShareModal — atur siapa (NIP) yang boleh membuka sebuah item (B1).
 * Dipakai untuk chart/dashboard/story. Hanya pemilik/admin yang boleh membuka.
 *
 * Props:
 *   module    : "charts" | "dashboards" | "stories" (basis endpoint)
 *   item      : { id, name, sharedWith? }
 *   onClose() : tutup modal
 *   onSaved(sharedWith) : dipanggil setelah tersimpan
 */
export default function ShareModal({ module, item, onClose, onSaved }) {
  const [shared, setShared] = useState(item.sharedWith || []); // [{nip,nama}] atau [nip]
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // normalisasi sharedWith jadi array of nip string
  const nips = shared.map((s) => (typeof s === "string" ? s : s.nip));

  // Auto-search saat ketik ≥4 karakter (nama/NIP).
  useEffect(() => {
    if (q.trim().length < 4) { setResults([]); return; }
    let alive = true;
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`)
        .then((r) => r.json())
        .then((j) => { if (alive) setResults(j.data || []); })
        .catch(() => alive && setResults([]))
        .finally(() => alive && setSearching(false));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  function add(u) {
    if (!nips.includes(u.nip)) setShared([...shared, u]);
    setQ(""); setResults([]);
  }
  function removeNip(nip) {
    setShared(shared.filter((s) => (typeof s === "string" ? s : s.nip) !== nip));
  }

  async function save() {
    setSaving(true); setMsg("");
    try {
      const r = await apiFetch(`/api/${module}/${item.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sharedWith: nips }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      onSaved && onSaved(nips);
      onClose();
    } catch (e) { setMsg("Gagal: " + e.message); setSaving(false); }
  }

  const label = (s) => (typeof s === "string" ? s : `${s.nip}${s.nama ? " · " + s.nama : ""}`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-gray-900">Bagikan akses</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <p className="text-xs text-gray-500 mb-3 truncate">"{item.name}"</p>

        <label className="block text-xs font-semibold text-gray-600 mb-1">
          Cari pegawai (nama / NIP) — ketik ≥4 karakter
        </label>
        <div className="relative">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="mis. 0601 atau nama"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
          {searching && <div className="absolute right-2 top-2.5"><Spinner size={16} /></div>}
          {results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow max-h-56 overflow-auto">
              {results.map((u) => (
                <button key={u.nip} onClick={() => add(u)}
                  disabled={nips.includes(u.nip)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-teal-50 disabled:opacity-40 flex justify-between">
                  <span className="font-mono">{u.nip}</span>
                  <span className="text-gray-500 truncate ml-2">{u.nama || "—"}</span>
                </button>
              ))}
            </div>
          )}
          {q.trim().length >= 4 && !searching && results.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">Tidak ada yang cocok (hanya NIP terdaftar di DARA).</p>
          )}
        </div>

        <div className="mt-3">
          <span className="text-xs font-semibold text-gray-600">Diberi akses ({nips.length}):</span>
          <div className="flex flex-wrap gap-1 mt-1 min-h-[28px]">
            {shared.length === 0 && <span className="text-xs text-gray-400">Belum ada — hanya Anda & admin.</span>}
            {shared.map((s) => {
              const nip = typeof s === "string" ? s : s.nip;
              return (
                <span key={nip} className="text-xs px-2 py-1 rounded-full bg-teal-600 text-white">
                  {label(s)}
                  <button onClick={() => removeNip(nip)} className="ml-1">✕</button>
                </span>
              );
            })}
          </div>
        </div>

        {msg && <p className="text-sm text-red-600 mt-2">{msg}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">Batal</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-lg bg-teal-600 text-white font-semibold text-sm disabled:opacity-50">
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
        </div>
      </div>
    </div>
  );
}
