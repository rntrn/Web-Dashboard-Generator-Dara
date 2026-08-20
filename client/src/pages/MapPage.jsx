import { useEffect, useMemo, useState } from "react";
import { geoApi } from "../api/geo";
import { chartsApi } from "../api/charts";
import { apiFetch } from "../api/http";
import MapView from "../components/MapView";
import { PageHeader, Card, Btn, EmptyState, Notice } from "../components/ui";
import { useI18n } from "../i18n/I18nContext.jsx";

/**
 * MapPage v0.19.0 — buat chart PETA MULTI-LAYER.
 *  - Tambah banyak layer (area/point) dari tabel geo terdeteksi.
 *  - Tiap layer: pilih tabel, kolom nilai, nama & warna.
 *  - Filter peta (opsional) → jembatan ke filter dashboard.
 *  - Simpan sebagai chart tipe "map" → bisa ditaruh & di-resize di Dashboard.
 */
const COLORS = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export default function MapPage() {
  const { t } = useI18n();
  const [geoTables, setGeoTables] = useState([]);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState([]);
  const [msg, setMsg] = useState("");

  const [name, setName] = useState("");
  const [layers, setLayers] = useState([]);            // konfigurasi layer
  const [filterColumn, setFilterColumn] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [filterOptions, setFilterOptions] = useState([]);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    geoApi.tables().then((r) => setGeoTables(r.data)).catch((e) => setErr(e.message));
    loadSaved();
  }, []);
  function loadSaved() {
    chartsApi.list().then((r) => setSaved((r.data || []).filter((c) => c.chartType === "map"))).catch(() => {});
  }

  const metaOf = (table) => geoTables.find((gt) => gt.table === table);

  /** Tambah layer dari sebuah tabel geo. */
  function addLayer(table) {
    const m = metaOf(table);
    if (!m) return;
    const base = { id: `L${Date.now()}`, type: m.kind, table, name: table,
      color: COLORS[layers.length % COLORS.length] };
    if (m.kind === "area") {
      base.geoColumn = m.geoColumn;
      base.valueColumn = m.valueColumns[0] || "";
      base.labelColumn = m.labelColumns[0] || "";
    } else {
      base.latColumn = m.latColumn; base.lngColumn = m.lngColumn;
      base.valueColumn = m.valueColumns.find((c) => !/^(lat|lng|id)$/i.test(c)) || "";
      base.labelColumn = m.labelColumns[0] || "";
      base.categoryColumn = m.labelColumns.find((c) => /categ|kategori|jenis|type/i.test(c)) || "";
    }
    setLayers([...layers, base]);
  }
  function updateLayer(i, patch) {
    const next = [...layers]; next[i] = { ...next[i], ...patch }; setLayers(next);
  }
  function removeLayer(i) { setLayers(layers.filter((_, x) => x !== i)); }

  // kolom kandidat filter (label semua layer)
  const filterColumns = useMemo(() => {
    const s = new Set();
    for (const L of layers) { const m = metaOf(L.table); if (m) m.labelColumns.forEach((c) => s.add(c)); }
    return [...s];
  }, [layers, geoTables]);

  useEffect(() => {
    setFilterValue(""); setFilterOptions([]);
    if (!filterColumn) return;
    const src = layers.map((L) => L.table).find((tbl) => metaOf(tbl)?.columns.includes(filterColumn));
    if (!src) return;
    apiFetch(`/api/databases/tables/${src}/distinct?column=${filterColumn}`)
      .then((r) => r.json()).then((r) => setFilterOptions(r.data || [])).catch(() => {});
  }, [filterColumn, layers]); // eslint-disable-line

  const geo = useMemo(() => (layers.length ? { layers, filterColumn: filterColumn || null } : null), [layers, filterColumn]);
  const previewFilters = filterColumn && filterValue ? [{ column: filterColumn, value: filterValue }] : [];

  function resetForm() {
    setEditingId(null); setName(""); setLayers([]); setFilterColumn(""); setFilterValue("");
  }

  async function save() {
    if (!geo) { setMsg(t("mapPage.layersRequiredMsg")); return; }
    if (!name.trim()) { setMsg(t("mapPage.nameRequiredMsg")); return; }
    try {
      const payload = { name, chartType: "map", geo };
      if (editingId) await chartsApi.update(editingId, payload);
      else await chartsApi.create(payload);
      setMsg(t("mapPage.savedMsg"));
      resetForm(); loadSaved();
    } catch (e) { setMsg(t("mapPage.failedWithMsg", { msg: e.message })); }
  }

  function editMap(c) {
    setEditingId(c.id); setName(c.name);
    setLayers(c.geo?.layers || []); setFilterColumn(c.geo?.filterColumn || "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const sel = "border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full";

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <PageHeader title={editingId ? t("mapPage.pageTitleEdit") : t("mapPage.pageTitle")}
        subtitle={t("mapPage.pageSubtitle")} />
      <div className="mb-4"><Notice>{err}</Notice></div>

      {geoTables.length === 0 && !err ? (
        <EmptyState icon="🗺️" title={t("mapPage.emptyTitle")}
          hint={t("mapPage.emptyHint")} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Panel konfigurasi */}
          <Card className="p-6 space-y-4">
            {/* Tambah layer */}
            <div>
              <label className="block text-sm font-semibold mb-1">{t("mapPage.addLayerLabel")}</label>
              <div className="flex flex-wrap gap-2">
                {geoTables.map((gt) => (
                  <button key={gt.table} onClick={() => addLayer(gt.table)}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-gray-300 hover:border-teal-500 hover:bg-teal-50">
                    + {gt.kind === "area" ? "▧" : "•"} {gt.table}
                  </button>
                ))}
              </div>
            </div>

            {/* Daftar layer */}
            <div className="space-y-2">
              {layers.map((L, i) => {
                const m = metaOf(L.table);
                return (
                  <div key={L.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-4 h-4 rounded-full" style={{ backgroundColor: L.color }} />
                      <span className="text-xs font-semibold uppercase text-gray-500">{L.type}</span>
                      <input className="border border-gray-200 rounded px-2 py-0.5 text-sm flex-1"
                        value={L.name} onChange={(e) => updateLayer(i, { name: e.target.value })} />
                      <button onClick={() => removeLayer(i)} className="text-red-500 text-xs px-1">✕</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {m && (
                        <select className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                          value={L.valueColumn || ""} onChange={(e) => updateLayer(i, { valueColumn: e.target.value })}>
                          <option value="">{L.type === "area" ? t("mapPage.colorNoValueOption") : t("mapPage.sizeFixedOption")}</option>
                          {m.valueColumns.map((c) => <option key={c} value={c}>
                            {L.type === "area" ? t("mapPage.colorLabel") : t("mapPage.sizeLabel")} ~ {c}</option>)}
                        </select>
                      )}
                      <div className="flex gap-1 items-center">
                        {COLORS.map((c) => (
                          <span key={c} onClick={() => updateLayer(i, { color: c })}
                            className={`w-5 h-5 rounded-full cursor-pointer border-2 ${L.color === c ? "border-gray-900" : "border-transparent"}`}
                            style={{ backgroundColor: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
              {layers.length === 0 && <p className="text-gray-400 text-sm">{t("mapPage.noLayersText")}</p>}
            </div>

            {/* Filter */}
            <div>
              <label className="block text-sm font-semibold mb-1">{t("mapPage.filterLabel")}</label>
              <div className="flex gap-2">
                <select className={sel} value={filterColumn} onChange={(e) => setFilterColumn(e.target.value)}>
                  <option value="">{t("mapPage.noFilterOption")}</option>
                  {filterColumns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                {filterColumn && (
                  <select className={sel} value={filterValue} onChange={(e) => setFilterValue(e.target.value)}>
                    <option value="">{t("mapPage.allOption")}</option>
                    {filterOptions.map((v) => <option key={String(v)} value={v}>{String(v)}</option>)}
                  </select>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">{t("mapPage.filterBridgeHint")}</p>
            </div>

            <div>
              <label className="block text-sm font-semibold mb-1">{t("mapPage.mapNameLabel")}</label>
              <input className={sel} value={name} onChange={(e) => setName(e.target.value)}
                placeholder={t("mapPage.mapNamePlaceholder")} />
            </div>

            <div className="flex gap-2">
              <Btn variant="solid" onClick={save} disabled={!geo}>{editingId ? t("mapPage.updateButton") : t("mapPage.saveButton")}</Btn>
              {editingId && <Btn onClick={resetForm}>{t("common.cancel")}</Btn>}
            </div>
            {msg && <p className="text-sm text-gray-600">{msg}</p>}
          </Card>

          {/* Preview */}
          <Card className="p-2 overflow-hidden" style={{ minHeight: 400 }}>
            {geo ? <MapView geo={geo} filters={previewFilters} height={440} /> : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm p-10">
                {t("mapPage.addLayerToPreviewHint")}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Peta tersimpan */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">{t("mapPage.savedMapsHeading")}</h2>
        {saved.length === 0 ? (
          <p className="text-gray-500">{t("mapPage.noSavedMaps")}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {saved.map((c) => (
              <div key={c.id} className="relative">
                <div className="absolute top-2 right-2 z-[500] flex gap-1">
                  <button onClick={() => editMap(c)} className="text-xs px-2 py-1 rounded bg-teal-50 text-teal-700 border border-teal-200">{t("mapPage.editButton")}</button>
                  <button onClick={() => chartsApi.remove(c.id).then(loadSaved).catch((e) => setMsg(e.message))}
                    className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 border border-red-200">{t("mapPage.deleteButton")}</button>
                </div>
                <Card className="p-3">
                  <h4 className="text-sm font-semibold mb-2">{c.name} <span className="text-xs text-gray-400">{t("mapPage.layerCountLabel", { count: (c.geo?.layers || []).length })}</span></h4>
                  <MapView geo={c.geo} filters={[]} height={280} />
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
