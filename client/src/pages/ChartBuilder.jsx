import { apiFetch, getUser } from "../api/http.js";
import { useEffect, useState } from "react";
import { databasesApi } from "../api/databases";
import { chartsApi } from "../api/charts";
import ChartPreview from "../components/ChartPreview";
import CondFormatEditor from "../components/CondFormatEditor";
import CalcFieldEditor from "../components/CalcFieldEditor";
import ConfirmDialog from "../components/ConfirmDialog";
import ShareModal from "../components/ShareModal";
import YearPager from "../components/YearPager";
import { PageHeader } from "../components/ui";
import { FORMAT_OPTIONS } from "../lib/format";
import { TABLE_CALC_OPTIONS } from "../lib/tableCalc";
import { yearPage } from "../lib/yearPage";
import { useI18n } from "../i18n/I18nContext.jsx";

/**
 * ChartBuilder v0.5.0 — gaya "Show Me" (Tableau/PowerBI):
 * 1. Pilih tabel
 * 2. Centang hingga 2 DIMENSI (kolom biasa / relasi JOIN) + 2 MEASURE
 * 3. Panel tipe chart otomatis enable/disable sesuai PRASYARAT tiap tipe
 *    (diambil dari GET /api/chart-types — sumber kebenaran di backend)
 * 4. Preview (ECharts) -> Simpan
 */
export default function ChartBuilder() {
  const { t } = useI18n();
  const [tables, setTables] = useState([]);
  const [chartTypes, setChartTypes] = useState([]);
  const [table, setTable] = useState("");
  const [columns, setColumns] = useState([]);
  const [relations, setRelations] = useState([]);

  // pilihan user
  const [selDims, setSelDims] = useState([]);       // item: {kind:"col"|"rel", value, relIdx?}
  const [selMeas, setSelMeas] = useState([]);       // nama kolom numerik
  const [chartType, setChartType] = useState("");
  const [aggregation, setAggregation] = useState("SUM");
  const [tableCalc, setTableCalc] = useState(""); // kalkulasi tabel (R2)
  const [condFormat, setCondFormat] = useState(null); // conditional formatting Tabel/Pivot (R2-3)
  const [dateGrain, setDateGrain] = useState(""); // hierarki waktu (R2-4)
  const [topN, setTopN] = useState(0);            // batas baris (R2-4)
  const [calcFields, setCalcFields] = useState([]); // calculated field (R2-5)
  const [name, setName] = useState("");
  const [color, setColor] = useState(""); // warna utama chart (opsional)
  const [format, setFormat] = useState(""); // format angka

  const COLOR_CHOICES = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

  const [spec, setSpec] = useState(null);
  const [saved, setSaved] = useState([]);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState(null);   // id chart yang sedang diedit
  const [pendingEdit, setPendingEdit] = useState(null); // chart menunggu kolom/relasi termuat

  // B1: identitas + status modul ACL + item yang sedang dibagikan
  const me = getUser();
  const [aclEnabled, setAclEnabled] = useState(false);
  const [shareItem, setShareItem] = useState(null);
  const canShare = (c) => aclEnabled && me &&
    (me.role === "admin" || (c.createdBy && c.createdBy.nip === me.nip));

  // Filter tahun + pagination + perbesar kartu (permintaan #1)
  const [chartYear, setChartYear] = useState("all");
  const [chartPage, setChartPage] = useState(1);
  const [enlarge, setEnlarge] = useState(null); // chart yang diperbesar
  const savedView = yearPage(saved, { year: chartYear, page: chartPage, pageSize: 8 });

  useEffect(() => {
    databasesApi.listTables().then((r) => setTables(r.data)).catch(() => {});
    apiFetch("/api/chart-types").then((r) => r.json()).then((r) => setChartTypes(r.data)).catch(() => {});
    apiFetch("/api/auth/me").then((r) => r.json())
      .then((j) => setAclEnabled(!!j.data?.aclEnabled)).catch(() => {});
    loadSaved();
  }, []);

  function loadSaved() {
    chartsApi.list().then((r) => setSaved(r.data)).catch(() => {});
  }

  // Konfirmasi hapus chart (satuan / massal).
  const [confirmDel, setConfirmDel] = useState(null); // {kind:"one"|"all", id?, name?, busy?}
  async function doConfirmDelete() {
    if (!confirmDel) return;
    setConfirmDel({ ...confirmDel, busy: true });
    try {
      if (confirmDel.kind === "all") {
        const r = await chartsApi.removeAll();
        if (editingId) cancelEdit();
        setMsg(t("chartBuilder.deletedCount", { count: r.data.deleted }));
      } else {
        await chartsApi.remove(confirmDel.id);
        if (editingId === confirmDel.id) cancelEdit();
      }
      loadSaved();
    } catch (e) { setMsg(e.message); }
    finally { setConfirmDel(null); }
  }

  useEffect(() => {
    if (!table) return;
    setColumns([]); setRelations([]); setSelDims([]); setSelMeas([]);
    setChartType(""); setSpec(null); setMsg("");
    databasesApi.getSchema(table).then((r) => setColumns(r.data.columns)).catch(() => {});
    databasesApi.getRelations(table).then((r) => setRelations(r.data)).catch(() => setRelations([]));
  }, [table]);

  /** Mulai edit chart tersimpan: isi tabel dulu, sisanya menyusul saat kolom/relasi termuat. */
  function startEdit(chart) {
    setEditingId(chart.id);
    setPendingEdit(chart);
    setName(chart.name || "");
    setColor(chart.color || "");
    setFormat(chart.format || "");
    setTable(chart.table); // memicu load kolom+relasi (effect [table] mereset pilihan)
    setMsg(t("chartBuilder.loadingEdit"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null); setPendingEdit(null);
    setSelDims([]); setSelMeas([]); setChartType(""); setName(""); setColor(""); setFormat(""); setSpec(null);
    setMsg("");
  }

  /** Terapkan pendingEdit setelah kolom & relasi tabelnya siap. */
  useEffect(() => {
    if (!pendingEdit || pendingEdit.table !== table) return;
    if (columns.length === 0) return; // tunggu kolom termuat

    const c = pendingEdit;
    // measures langsung dari nama kolom
    setSelMeas(c.measures || []);
    // dimensions: bila ada join, dimensi pertama = label relasi -> cari relasinya
    const dims = (c.dimensions || []).map((d) => {
      if (c.join && d === c.join.label) {
        const idx = relations.findIndex(
          (r) => r.refTable === c.join.table && r.column === c.join.localKey);
        if (idx !== -1) return { kind: "rel", value: `${relations[idx].refTable}.${relations[idx].labelColumn}`, relIdx: idx };
      }
      return { kind: "col", value: d };
    });
    setSelDims(dims);
    setAggregation(c.aggregation || "SUM");
    setTableCalc(c.tableCalc || "");
    setCondFormat(c.condFormat || null);
    setDateGrain(c.dateGrain || "");
    setTopN(c.topN || 0);
    setCalcFields(c.calcMeasures || []);
    setChartType(c.chartType);
    setPendingEdit(null);
    setMsg(t("chartBuilder.editingHint"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEdit, table, columns, relations]);

  const numericCols = columns.filter((c) => /INT|REAL|NUM|DEC|FLOAT|DOUBLE/i.test(c.type || ""));
  const dimCols = columns.filter((c) => !/_id$/i.test(c.name)); // FK lebih baik lewat relasi

  /**
   * Kolom "terlihat seperti ID" walau namanya bukan literal "id" (mis. nip,
   * nik, no_ktp, kode_barang) — DAN kolom yang letaknya paling depan di
   * tabel, karena kolom identitas biasanya diletakkan di awal. Kolom seperti
   * ini seringkali bertipe VARCHAR (mis. NIP "000000001" dgn nol di depan),
   * jadi TIDAK LOLOS filter numericCols di atas dan sebelumnya hilang total
   * dari pilihan Measure — padahal "berapa banyak ID" (COUNT/COUNT DISTINCT)
   * tetap pertanyaan yang wajar & valid untuk kolom non-numerik sekalipun
   * (SQL COUNT() bekerja pada tipe kolom apapun).
   */
  function isIdLike(col, idx) {
    return idx === 0 || /(^|_)(id|no|nomor|kode|code)(_|$)/i.test(col.name || "");
  }
  const numericNames = new Set(numericCols.map((c) => c.name));
  const idLikeCols = columns.filter((c, i) => !numericNames.has(c.name) && isIdLike(c, i));
  const idLikeNames = new Set(idLikeCols.map((c) => c.name));

  /** Measure terpilih yang non-numerik (ID) → cuma valid utk COUNT/DISTINCT. */
  const hasCountOnlyMeasure = selMeas.some((m) => idLikeNames.has(m));
  const AGG_OPTIONS = [
    ["SUM", t("chartBuilder.aggSum")], ["AVG", t("chartBuilder.aggAvg")],
    ["COUNT", t("chartBuilder.aggCount")], ["MIN", t("chartBuilder.aggMin")], ["MAX", t("chartBuilder.aggMax")],
    ["DISTINCT", t("chartBuilder.aggDistinct")],
    ["MEDIAN", t("chartBuilder.aggMedian")],
    ["P90", t("chartBuilder.aggP90")], ["P95", t("chartBuilder.aggP95")],
  ];
  // Kolom ID non-numerik dipilih → SUM/AVG/MIN/MAX/MEDIAN/P90/P95 tidak
  // bermakna (dan akan error di database). Batasi ke COUNT/DISTINCT saja.
  const availableAggs = hasCountOnlyMeasure
    ? AGG_OPTIONS.filter(([v]) => v === "COUNT" || v === "DISTINCT")
    : AGG_OPTIONS;

  // Kalau measure ID dipilih sementara agregasi sekarang bukan COUNT/DISTINCT
  // (mis. sebelumnya SUM utk measure numerik lain), otomatis alihkan ke
  // DISTINCT supaya tidak diam-diam mengirim agregasi tidak valid.
  useEffect(() => {
    if (hasCountOnlyMeasure && !["COUNT", "DISTINCT"].includes(aggregation)) {
      setAggregation("DISTINCT");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCountOnlyMeasure]);

  // AUTO-PREVIEW: begitu tipe chart terpilih & prasyarat terpenuhi,
  // preview langsung dirender tanpa harus klik tombol.
  useEffect(() => {
    if (!chartType) { setSpec(null); return; }
    const t = chartTypes.find((x) => x.id === chartType);
    if (!t || !typeEnabled(t)) {
      // pilihan berubah sampai tak memenuhi syarat -> reset tipe
      setChartType(""); setSpec(null); return;
    }
    const s = buildSpec();
    if (s) setSpec({ ...s, title: s.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType, selDims, selMeas, aggregation, tableCalc, condFormat, dateGrain, topN, calcFields, name, color, format]);

  /** Toggle pilihan dimensi (maks 2). Hanya 1 dimensi relasi (JOIN 1 hop). */
  function toggleDim(item) {
    setSpec(null); setMsg("");
    const key = (x) => `${x.kind}:${x.value}`;
    const exists = selDims.find((d) => key(d) === key(item));
    if (exists) return setSelDims(selDims.filter((d) => key(d) !== key(item)));
    if (selDims.length >= 2) return setMsg(t("chartBuilder.maxDimensions"));
    if (item.kind === "rel" && selDims.some((d) => d.kind === "rel"))
      return setMsg(t("chartBuilder.onlyOneRelDimension"));
    setSelDims([...selDims, item]);
  }

  function toggleMea(colName) {
    setSpec(null); setMsg("");
    if (selMeas.includes(colName)) return setSelMeas(selMeas.filter((m) => m !== colName));
    if (selMeas.length >= 2) return setMsg(t("chartBuilder.maxMeasures"));
    setSelMeas([...selMeas, colName]);
  }

  /** Calculated field valid (punya ekspresi) — ikut dihitung sebagai measure. */
  function activeCalc() {
    return calcFields.filter((c) => c.expr && c.expr.trim());
  }

  /**
   * Saran nama chart dari dimensi/measure yang sedang dipilih — pola sama
   * dengan yang dipakai usulan chart otomatis (lihat suggestions.service.js:
   * "Total X", "X per Y", "Jumlah baris per Y"). Dipakai sebagai placeholder
   * DAN sebagai nama sungguhan bila field "Nama chart" dibiarkan kosong saat
   * disimpan (buildSpec()) — supaya chart baru tidak lagi bernama generik
   * "bar dara_data_pegawai", tapi mis. "Populasi per Provinsi".
   */
  function suggestChartName() {
    const dimLabels = selDims.map((d) =>
      d.kind === "rel" ? (relations[d.relIdx]?.labelColumn || d.value) : d.value);
    const meaLabels = selMeas.length ? selMeas : activeCalc().map((c) => c.name || t("chartBuilder.calcFieldDefaultName"));

    if (meaLabels.length && dimLabels.length)
      return t("chartBuilder.suggestNameMeaDim", { mea: meaLabels.join(" & "), dim: dimLabels.join(" × ") });
    if (meaLabels.length) return t("chartBuilder.suggestNameMeaOnly", { mea: meaLabels.join(" & ") });
    if (dimLabels.length) return t("chartBuilder.suggestNameDimOnly", { dim: dimLabels.join(" × ") });
    return "";
  }

  /** Cek prasyarat tipe chart terhadap pilihan sekarang. */
  function typeEnabled(t) {
    // Calc field menggantikan measure kolom bila diisi → hitung salah satunya.
    const meaCount = activeCalc().length || selMeas.length;
    return selDims.length >= t.minDim && selDims.length <= t.maxDim &&
           meaCount >= t.minMea && meaCount <= t.maxMea;
  }

  /** Bangun spec dari pilihan. Dimensi relasi harus jadi d1 (aturan backend). */
  function buildSpec() {
    if (!table || !chartType) return null;
    const rel = selDims.find((d) => d.kind === "rel");
    const ordered = rel ? [rel, ...selDims.filter((d) => d !== rel)] : selDims;

    let join = null;
    const dimensions = ordered.map((d) => {
      if (d.kind === "rel") {
        const r = relations[d.relIdx];
        join = { table: r.refTable, localKey: r.column, label: r.labelColumn, targetKey: r.refColumn };
        return r.labelColumn;
      }
      return d.value;
    });

    return {
      name: name.trim() || suggestChartName() || `${chartType} ${table}`,
      table, chartType, dimensions,
      measures: selMeas,
      aggregation: (selMeas.length || activeCalc().length) ? aggregation : "COUNT",
      join,
      color: color || null,
      format: format || null,
      tableCalc: tableCalc || null,
      condFormat: ["table", "pivot"].includes(chartType) ? condFormat : null,
      dateGrain: dateGrain || null,
      topN: Number(topN) || 0,
      calcMeasures: activeCalc(),
    };
  }

  async function handleSave() {
    const s = buildSpec();
    if (!s) { setMsg(t("chartBuilder.completeSelectionFirst")); return; }
    if (!s.name.trim()) { setMsg(t("chartBuilder.giveChartName")); return; }
    try {
      if (editingId) {
        await chartsApi.update(editingId, s);
        setMsg(t("chartBuilder.chartUpdated"));
        setEditingId(null);
      } else {
        await chartsApi.create(s);
        setMsg(t("chartBuilder.chartSaved"));
      }
      loadSaved();
    } catch (e) { setMsg(t("chartBuilder.failedWithMsg", { msg: e.message })); }
  }

  const chip = (active, disabled = false) =>
    `px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer select-none ${
      disabled ? "opacity-30 cursor-not-allowed border-gray-200 text-gray-400" :
      active ? "bg-blue-600 text-white border-blue-600" :
      "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
    }`;

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <PageHeader title={editingId ? t("chartBuilder.titleEdit") : t("chartBuilder.title")}
        subtitle={editingId
          ? t("chartBuilder.subtitleEdit")
          : t("chartBuilder.subtitle")} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel kiri: pilihan */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-1">{t("chartBuilder.tableLabel")}</label>
            <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
              value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="">{t("chartBuilder.selectTablePlaceholder")}</option>
              {tables.map((tb) => (
                <option key={tb.name} value={tb.name}>
                  {tb.label ? `${tb.label} (${tb.name})` : tb.name} ({tb.row_count})
                </option>
              ))}
            </select>
          </div>

          {table && (
            <>
              <div>
                <label className="block text-sm font-semibold mb-2">
                  {t("chartBuilder.dimensionsLabel")} <span className="text-gray-400 font-normal">({selDims.length}/2)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {dimCols.map((c) => {
                    const item = { kind: "col", value: c.name };
                    const active = selDims.some((d) => d.kind === "col" && d.value === c.name);
                    return (
                      <span key={c.name} className={chip(active)} onClick={() => toggleDim(item)}>
                        {c.name}
                      </span>
                    );
                  })}
                  {relations.map((r, i) => {
                    const item = { kind: "rel", value: `${r.refTable}.${r.labelColumn}`, relIdx: i };
                    const active = selDims.some((d) => d.kind === "rel" && d.relIdx === i);
                    return (
                      <span key={`rel${i}`} className={chip(active)} onClick={() => toggleDim(item)}>
                        ⤷ {r.refTable}.{r.labelColumn}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-2">
                  {t("chartBuilder.measuresLabel")} <span className="text-gray-400 font-normal">({selMeas.length}/2)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {numericCols.map((c) => (
                    <span key={c.name} className={chip(selMeas.includes(c.name))}
                      onClick={() => toggleMea(c.name)}>
                      Σ {c.name}
                    </span>
                  ))}
                  {idLikeCols.map((c) => (
                    <span key={c.name} className={chip(selMeas.includes(c.name))}
                      onClick={() => toggleMea(c.name)}
                      title={t("chartBuilder.idColumnTooltip")}>
                      # {c.name}
                    </span>
                  ))}
                </div>
                {idLikeCols.length > 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t("chartBuilder.idColumnHint")} <b>COUNT</b>/<b>COUNT DISTINCT</b>.
                  </p>
                )}
                {selMeas.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="text-[11px] text-gray-500">{t("chartBuilder.aggregationLabel")}</label>
                    <select className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                      value={aggregation} onChange={(e) => setAggregation(e.target.value)}
                      title={hasCountOnlyMeasure ? t("chartBuilder.idMeasureOnlyTooltip") : ""}>
                      {availableAggs.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                    <label className="text-[11px] text-gray-500 ml-1">{t("chartBuilder.calculationLabel")}</label>
                    <select className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                      value={tableCalc} onChange={(e) => setTableCalc(e.target.value)}
                      title={t("chartBuilder.tableCalcTooltip")}>
                      {TABLE_CALC_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Waktu & batas (R2-4): grain hierarki tanggal + top-N */}
              {selDims.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <label className="text-[11px] text-gray-500">{t("chartBuilder.timeGrainLabel")}</label>
                  <select className="border border-gray-300 rounded-lg px-2 py-1 text-xs"
                    value={dateGrain} onChange={(e) => setDateGrain(e.target.value)}
                    title={t("chartBuilder.dateGrainTooltip")}>
                    {[["", t("chartBuilder.grainNone")], ["year", t("chartBuilder.grainYear")],
                      ["month", t("chartBuilder.grainMonth")], ["day", t("chartBuilder.grainDay")]]
                      .map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="text-[11px] text-gray-500 ml-1">{t("chartBuilder.topNLabel")}</label>
                  <input type="number" min={0} max={100} value={topN}
                    onChange={(e) => setTopN(Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)))}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-16"
                    title={t("chartBuilder.topNTooltip")} />
                </div>
              )}

              {/* Calculated field (R2-5): measure dari ekspresi */}
              <CalcFieldEditor value={calcFields} onChange={setCalcFields}
                columns={columns.map((c) => c.name)} />

              {/* Conditional formatting: hanya untuk Tabel & Pivot (R2-3) */}
              {["table", "pivot"].includes(chartType) && (
                <CondFormatEditor value={condFormat} onChange={setCondFormat} colors={COLOR_CHOICES} />
              )}

              {/* Panel Show Me: tipe chart sesuai prasyarat */}
              <div>
                <label className="block text-sm font-semibold mb-2">{t("chartBuilder.chartTypeLabel")}</label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {chartTypes.map((ct) => {
                    const ok = typeEnabled(ct);
                    return (
                      <div key={ct.id} title={`${ct.hint}\n${t("chartBuilder.chartTypeRequirement", {
                          minDim: ct.minDim, maxDim: ct.maxDim, minMea: ct.minMea, maxMea: ct.maxMea,
                        })}`}
                        onClick={() => ok && (setChartType(ct.id), setSpec(null))}
                        className={`text-center py-2 px-1 rounded-lg border text-xs font-semibold ${
                          !ok ? "opacity-30 cursor-not-allowed border-gray-200" :
                          chartType === ct.id ? "bg-blue-600 text-white border-blue-600 cursor-pointer" :
                          "bg-white border-gray-300 hover:border-blue-400 cursor-pointer"
                        }`}>
                        {ct.name}
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {t("chartBuilder.chartTypeDimmedHint")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">{t("chartBuilder.primaryColorLabel")}</label>
                <div className="flex gap-2 items-center">
                  {COLOR_CHOICES.map((c) => (
                    <span key={c} onClick={() => setColor(color === c ? "" : c)}
                      className={`w-6 h-6 rounded-full cursor-pointer border-2 ${
                        color === c ? "border-gray-900 scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }} />
                  ))}
                  {color && (
                    <button onClick={() => setColor("")}
                      className="text-xs text-gray-500 underline">{t("chartBuilder.resetColor")}</button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">{t("chartBuilder.numberFormatLabel")}</label>
                <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                  value={format} onChange={(e) => setFormat(e.target.value)}>
                  {FORMAT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1">{t("chartBuilder.chartNameLabel")}</label>
                <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
                  value={name} placeholder={suggestChartName() || t("chartBuilder.chartNamePlaceholder")}
                  onChange={(e) => setName(e.target.value)} />
                {!name.trim() && suggestChartName() && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    {t("chartBuilder.emptyNameAutoHint")} <b>{suggestChartName()}</b>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={handleSave} disabled={!chartType}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm disabled:opacity-40">
                  {editingId ? t("chartBuilder.updateButton") : t("chartBuilder.saveButton")}
                </button>
                {editingId && (
                  <button onClick={cancelEdit}
                    className="px-4 py-2 rounded-lg border border-gray-300 text-gray-600 font-semibold text-sm">
                    {t("chartBuilder.cancelEditButton")}
                  </button>
                )}
              </div>
            </>
          )}
          {msg && <p className="text-sm text-gray-600">{msg}</p>}
        </div>

        {/* Panel kanan: preview */}
        <div>
          {spec ? (
            <ChartPreview table={spec.table} suggestion={spec} />
          ) : (
            <div className="bg-white rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-400">
              {t("chartBuilder.previewEmptyPrefix")} <b>{t("chartBuilder.previewEmptyChartTypesLabel")}</b>{" "}
              {t("chartBuilder.previewEmptySuffix")}
            </div>
          )}
        </div>
      </div>

      {/* Chart tersimpan */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900">{t("chartBuilder.savedChartsHeading")}</h2>
          {saved.length > 0 && (
            <button onClick={() => setConfirmDel({ kind: "all" })}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50">
              🗑 {t("chartBuilder.deleteAllButton")}
            </button>
          )}
        </div>
        {saved.length === 0 ? (
          <p className="text-gray-500">{t("chartBuilder.noSavedCharts")}</p>
        ) : (
          <>
            <YearPager years={savedView.years} year={chartYear} setYear={setChartYear}
              page={chartPage} setPage={setChartPage} totalPages={savedView.totalPages}
              total={savedView.total} />
            {/* Kartu diperkecil; klik area chart untuk memperbesar */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {savedView.pageItems.map((c) => (
                <div key={c.id} className={`relative ${editingId === c.id ? "ring-2 ring-blue-500 rounded-xl" : ""}`}>
                  <div className="absolute top-1.5 right-1.5 z-10 flex gap-1">
                    {canShare(c) && (
                      <button onClick={() => setShareItem(c)} title={t("chartBuilder.shareAccessTooltip")}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 border border-teal-200">👥</button>
                    )}
                    <button onClick={() => startEdit(c)} title={t("chartBuilder.editTooltip")}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">✎</button>
                    <button onClick={() => setConfirmDel({ kind: "one", id: c.id, name: c.name })}
                      title={t("chartBuilder.deleteTooltip")}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">✕</button>
                  </div>
                  {/* klik chart → perbesar */}
                  <div className="cursor-zoom-in" onClick={() => setEnlarge(c)} title={t("chartBuilder.clickToEnlargeTooltip")}>
                    <ChartPreview table={c.table} suggestion={{ ...c, title: c.name }} height={150} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modal perbesar chart */}
      {enlarge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setEnlarge(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-gray-900 truncate">{enlarge.name}</h3>
              <button onClick={() => setEnlarge(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <ChartPreview table={enlarge.table} suggestion={{ ...enlarge, title: enlarge.name }} height={460} />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title={confirmDel?.kind === "all" ? t("chartBuilder.confirmDeleteAllTitle") : t("chartBuilder.confirmDeleteTitle")}
        message={confirmDel?.kind === "all"
          ? t("chartBuilder.confirmDeleteAllMessage")
          : <>{t("chartBuilder.confirmDeleteMessagePrefix")} <b>{confirmDel?.name}</b> {t("chartBuilder.confirmDeleteMessageSuffix")}</>}
        confirmWord={confirmDel?.kind === "all" ? "HAPUS" : null}
        confirmLabel={confirmDel?.kind === "all" ? t("chartBuilder.deleteAllConfirmLabel") : t("chartBuilder.deleteConfirmLabel")}
        busy={!!confirmDel?.busy}
        onConfirm={doConfirmDelete}
        onClose={() => setConfirmDel(null)} />

      {shareItem && (
        <ShareModal module="charts" item={shareItem}
          onClose={() => setShareItem(null)} onSaved={() => loadSaved()} />
      )}
    </div>
  );
}
