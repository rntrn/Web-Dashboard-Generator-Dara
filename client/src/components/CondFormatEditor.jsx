/**
 * CondFormatEditor — editor conditional formatting untuk chart Tabel/Pivot.
 * Nilai (value) = null | {mode:"scale",color} | {mode:"rules",rules:[{op,value,color}]}
 * Bentuk ini selaras dengan client/src/lib/condFormat.js & validasi backend.
 */

const OPS = [
  [">", "> lebih dari"], [">=", "≥ minimal"],
  ["<", "< kurang dari"], ["<=", "≤ maksimal"],
  ["=", "= sama dengan"], ["between", "di antara"],
];

export default function CondFormatEditor({ value, onChange, colors }) {
  const mode = value?.mode || "off";
  const palette = colors || ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

  function setMode(m) {
    if (m === "off") return onChange(null);
    if (m === "scale") return onChange({ mode: "scale", color: value?.color || palette[0] });
    // rules
    return onChange({ mode: "rules", rules: value?.rules?.length ? value.rules : [{ op: ">=", value: 0, color: palette[3] }] });
  }

  function setRule(i, patch) {
    const rules = value.rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ mode: "rules", rules });
  }
  function addRule() {
    onChange({ mode: "rules", rules: [...(value.rules || []), { op: ">=", value: 0, color: palette[1] }] });
  }
  function removeRule(i) {
    const rules = value.rules.filter((_, idx) => idx !== i);
    onChange(rules.length ? { mode: "rules", rules } : null);
  }

  return (
    <div className="mt-3 border border-gray-200 rounded-lg p-3 bg-gray-50/60">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Conditional formatting</span>
        <select className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
          value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="off">Nonaktif</option>
          <option value="scale">Skala warna (min → maks)</option>
          <option value="rules">Aturan ambang</option>
        </select>
      </div>

      {mode === "scale" && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-500">Warna:</span>
          {palette.map((c) => (
            <button key={c} type="button" onClick={() => onChange({ mode: "scale", color: c })}
              className={`w-5 h-5 rounded-full border-2 ${value.color === c ? "border-gray-800" : "border-white"}`}
              style={{ backgroundColor: c }} title={c} />
          ))}
        </div>
      )}

      {mode === "rules" && (
        <div className="space-y-1.5">
          {value.rules.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 flex-wrap">
              <select className="border border-gray-300 rounded px-1.5 py-1 text-xs bg-white"
                value={r.op} onChange={(e) => setRule(i, { op: e.target.value })}>
                {OPS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <input type="number" className="border border-gray-300 rounded px-1.5 py-1 text-xs w-20"
                value={r.value} onChange={(e) => setRule(i, { value: Number(e.target.value) })} />
              {r.op === "between" && (
                <>
                  <span className="text-[11px] text-gray-400">dan</span>
                  <input type="number" className="border border-gray-300 rounded px-1.5 py-1 text-xs w-20"
                    value={r.value2 ?? 0} onChange={(e) => setRule(i, { value2: Number(e.target.value) })} />
                </>
              )}
              <input type="color" className="w-7 h-7 rounded border border-gray-300 p-0.5 bg-white cursor-pointer"
                value={r.color} onChange={(e) => setRule(i, { color: e.target.value })} title="Warna sel" />
              <button type="button" onClick={() => removeRule(i)}
                className="text-xs text-red-500 hover:text-red-700 px-1" title="Hapus aturan">✕</button>
            </div>
          ))}
          <button type="button" onClick={addRule}
            className="text-xs text-teal-600 hover:text-teal-800 font-medium mt-1">+ Tambah aturan</button>
        </div>
      )}
    </div>
  );
}
