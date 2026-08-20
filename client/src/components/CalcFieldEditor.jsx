/**
 * CalcFieldEditor — definisikan "calculated field": measure dari ekspresi
 * aritmetika atas kolom, mis. "line_total / quantity".
 *
 * value  : Array<{ name, expr }>
 * columns: daftar nama kolom (untuk bantuan/klik-sisip) — opsional
 *
 * Ekspresi divalidasi & diamankan di backend (lib/calcExpr.js). Editor ini
 * hanya membantu penulisan; token yang diizinkan: nama kolom, angka, + - * / % ( ).
 */
export default function CalcFieldEditor({ value = [], onChange, columns = [] }) {
  const fields = Array.isArray(value) ? value : [];

  const setField = (i, patch) =>
    onChange(fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const addField = () => {
    if (fields.length >= 2) return;
    onChange([...fields, { name: `Hitung ${fields.length + 1}`, expr: "" }]);
  };
  const removeField = (i) => onChange(fields.filter((_, idx) => idx !== i));

  return (
    <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50/60">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
          Calculated field (measure dari rumus)
        </span>
        {fields.length < 2 && (
          <button type="button" onClick={addField}
            className="text-xs text-teal-600 hover:text-teal-800 font-medium">+ Tambah</button>
        )}
      </div>

      {fields.length === 0 ? (
        <p className="text-[11px] text-gray-400">
          Contoh: <code className="bg-gray-100 px-1 rounded">line_total / quantity</code>.
          Jika diisi, measure ini menggantikan measure kolom. Token: nama kolom, angka, + - * / ( ).
        </p>
      ) : (
        <div className="space-y-1.5">
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={f.name} onChange={(e) => setField(i, { name: e.target.value })}
                placeholder="Nama" className="border border-gray-300 rounded px-1.5 py-1 text-xs w-28" />
              <input value={f.expr} onChange={(e) => setField(i, { expr: e.target.value })}
                placeholder="mis. line_total / quantity"
                className="border border-gray-300 rounded px-1.5 py-1 text-xs flex-1 font-mono" />
              <button type="button" onClick={() => removeField(i)}
                className="text-xs text-red-500 hover:text-red-700 px-1" title="Hapus">✕</button>
            </div>
          ))}
          {columns.length > 0 && (
            <p className="text-[10px] text-gray-400 truncate" title={columns.join(", ")}>
              Kolom: {columns.slice(0, 10).join(", ")}{columns.length > 10 ? "…" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
