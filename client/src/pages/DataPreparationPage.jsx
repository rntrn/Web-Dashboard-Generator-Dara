import { useEffect, useState } from "react";
import { databasesApi } from "../api/databases";
import { dataprepApi } from "../api/dataprep";
import { PageHeader, Card, Btn, Badge, Notice, Spinner } from "../components/ui";
import PromptDialog from "../components/PromptDialog";
import ProgressDialog from "../components/ProgressDialog";
import { useI18n } from "../i18n/I18nContext";

/**
 * DataPreparationPage (khusus admin) — menu "Data Preparation", Fase 2.
 *
 * v0.43.0 — dari skeleton/placeholder jadi step-builder SUNGGUHAN: pilih
 * tabel sumber → pilih/ubah nama/ubah tipe kolom → opsional gabung (JOIN)
 * satu tabel lain → opsional filter baris (WHERE, gabungan AND) →
 * pratinjau langsung → simpan sebagai tabel baru `dara_data_prep_*`.
 * Lihat docs/08-data-connection.md bagian "Data Preparation" untuk
 * arsitektur lengkap & batasannya (satu JOIN saja, filter cuma AND/tanpa
 * grouping, belum ada agregasi/group-by atau recipe reusable — itu Fase 3
 * berikutnya, atau canvas visual query kalau nanti dievaluasi perlu).
 *
 * Server memvalidasi ULANG semua nama tabel/kolom terhadap skema
 * sungguhan (dataprep.service.js `compileRecipe`) — state di sini murni
 * untuk UX, BUKAN satu-satunya lapis keamanan.
 */

const TYPE_OPTIONS = [
  { value: "", idLabel: "(asli)", enLabel: "(original)" },
  { value: "num", idLabel: "Angka", enLabel: "Number" },
  { value: "text", idLabel: "Teks", enLabel: "Text" },
];

// Sinkron dengan whitelist FILTER_OPS di server (dataprep.service.js) —
// daftar di sini CUMA untuk isi dropdown, validasi SUNGGUHAN tetap di
// server (compileRecipe). "noValue" = operator tanpa kolom nilai (NULL check).
const FILTER_OP_OPTIONS = [
  { value: "eq" }, { value: "neq" }, { value: "gt" }, { value: "lt" },
  { value: "gte" }, { value: "lte" }, { value: "contains" }, { value: "not_contains" },
  { value: "is_null", noValue: true }, { value: "is_not_null", noValue: true },
];
const FILTER_OPS_NO_VALUE = new Set(["is_null", "is_not_null"]);

function keyOf(table, col) { return `${table}::${col}`; }

export default function DataPreparationPage() {
  const { t, lang } = useI18n();

  const [tables, setTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(true);

  const [sourceTable, setSourceTable] = useState("");
  const [sourceCols, setSourceCols] = useState([]);
  const [suggestedRelations, setSuggestedRelations] = useState([]);

  const [joinOn, setJoinOn] = useState(false);
  const [joinTable, setJoinTable] = useState("");
  const [joinCols, setJoinCols] = useState([]);
  const [joinLeftCol, setJoinLeftCol] = useState("");
  const [joinRightCol, setJoinRightCol] = useState("");
  const [joinType, setJoinType] = useState("LEFT");

  const [colState, setColState] = useState({}); // key(table,col) -> {included, as, type}
  const [filters, setFilters] = useState([]); // [{table, column, op, value}]
  const [loadErr, setLoadErr] = useState("");

  const [preview, setPreview] = useState(null); // {columns, rows} | null
  const [previewErr, setPreviewErr] = useState("");
  const [previewing, setPreviewing] = useState(false);

  const [rowLimit, setRowLimit] = useState(100000); // batas keras server MAX_ROWS=100000, lihat dataPrep.rowLimitHint

  const [savePrompt, setSavePrompt] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ open: false, phase: "running", errorText: "", successText: "" });

  useEffect(() => {
    databasesApi.listTables()
      .then((r) => setTables(r.data || []))
      .catch((e) => setLoadErr(e.message))
      .finally(() => setLoadingTables(false));
  }, []);

  // Ganti tabel sumber → muat skema kolomnya, reset JOIN, reset pilihan
  // kolom (semua kolom sumber otomatis TERCENTANG — default paling umum).
  useEffect(() => {
    setPreview(null); setPreviewErr(""); setFilters([]);
    if (!sourceTable) { setSourceCols([]); setColState({}); setSuggestedRelations([]); return; }
    setLoadErr("");
    databasesApi.getSchema(sourceTable).then((r) => {
      const cols = r.data.columns || [];
      setSourceCols(cols);
      const next = {};
      cols.forEach((c) => { next[keyOf("source", c.name)] = { included: true, as: c.name, type: "" }; });
      setColState(next);
    }).catch((e) => setLoadErr(e.message));
    dataprepApi.relations(sourceTable).then((r) => setSuggestedRelations(r.data || [])).catch(() => setSuggestedRelations([]));
    setJoinOn(false); setJoinTable(""); setJoinCols([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTable]);

  // Matikan JOIN → buang kolom tabel JOIN dari pilihan DAN filter yang menunjuk tabel JOIN.
  useEffect(() => {
    if (joinOn) return;
    setJoinTable(""); setJoinCols([]);
    setColState((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith("join::")) delete next[k]; });
      return next;
    });
    setFilters((prev) => prev.filter((f) => f.table !== "join"));
  }, [joinOn]);

  // Ganti tabel JOIN → muat skemanya, sarankan kolom penghubung dari
  // relationsService kalau ada (FK asli / konvensi nama "<x>_id").
  useEffect(() => {
    setPreview(null); setPreviewErr(""); setFilters((prev) => prev.filter((f) => f.table !== "join"));
    if (!joinOn || !joinTable) return;
    databasesApi.getSchema(joinTable).then((r) => {
      const cols = r.data.columns || [];
      setJoinCols(cols);
      setColState((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((k) => { if (k.startsWith("join::")) delete next[k]; });
        cols.forEach((c) => { next[keyOf("join", c.name)] = { included: false, as: c.name, type: "" }; });
        return next;
      });
      const rel = suggestedRelations.find((r2) => r2.refTable === joinTable);
      setJoinLeftCol(rel ? rel.column : (sourceCols[0]?.name || ""));
      setJoinRightCol(rel ? rel.refColumn : (cols[0]?.name || ""));
    }).catch((e) => setLoadErr(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinOn, joinTable]);

  function setCol(key, patch) {
    setColState((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setPreview(null);
  }

  // Kolom yang tersedia untuk filter: sumber selalu, JOIN kalau aktif.
  const filterableCols = [
    ...sourceCols.map((c) => ({ table: "source", column: c.name })),
    ...(joinOn ? joinCols.map((c) => ({ table: "join", column: c.name })) : []),
  ];

  function addFilter() {
    setFilters((prev) => [...prev, { table: "", column: "", op: "eq", value: "" }]);
    setPreview(null);
  }
  function updateFilter(idx, patch) {
    setFilters((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
    setPreview(null);
  }
  function removeFilter(idx) {
    setFilters((prev) => prev.filter((_, i) => i !== idx));
    setPreview(null);
  }

  function buildRecipe() {
    const columns = [];
    sourceCols.forEach((c) => {
      const st = colState[keyOf("source", c.name)];
      if (st?.included) columns.push({ table: "source", column: c.name, as: (st.as || c.name).trim(), type: st.type || null });
    });
    if (joinOn && joinTable) {
      joinCols.forEach((c) => {
        const st = colState[keyOf("join", c.name)];
        if (st?.included) columns.push({ table: "join", column: c.name, as: (st.as || c.name).trim(), type: st.type || null });
      });
    }
    return {
      sourceTable,
      columns,
      join: (joinOn && joinTable && joinLeftCol && joinRightCol)
        ? { table: joinTable, type: joinType, on: { leftColumn: joinLeftCol, rightColumn: joinRightCol } }
        : null,
      filters: filters.map((f) => ({ table: f.table, column: f.column, op: f.op, value: f.value })),
    };
  }

  const includedCount = Object.values(colState).filter((s) => s?.included).length;
  const filtersComplete = filters.every((f) => f.table && f.column && f.op && (FILTER_OPS_NO_VALUE.has(f.op) || (f.value !== "" && f.value != null)));
  const canPreview = !!sourceTable && includedCount > 0 && (!joinOn || (joinTable && joinLeftCol && joinRightCol)) && filtersComplete;

  // Alasan spesifik kenapa tombol Pratinjau masih nonaktif — supaya user
  // tidak menebak-nebak (sebelumnya cuma teks generik "klik pratinjau").
  let blockReason = "";
  if (sourceTable && includedCount === 0) blockReason = t("dataPrep.blockNoColumns");
  else if (joinOn && !joinTable) blockReason = t("dataPrep.blockJoinTableMissing");
  else if (joinOn && joinTable && (!joinLeftCol || !joinRightCol)) blockReason = t("dataPrep.blockJoinColsMissing");
  else if (!filtersComplete) blockReason = t("dataPrep.blockFiltersIncomplete");

  async function doPreview() {
    setPreviewErr(""); setPreviewing(true); setPreview(null);
    try {
      const r = await dataprepApi.preview(buildRecipe());
      setPreview(r.data);
    } catch (e) {
      setPreviewErr(e.message);
    } finally {
      setPreviewing(false);
    }
  }

  async function doSave(name) {
    setSavePrompt(false);
    setSaveProgress({ open: true, phase: "running", errorText: "", successText: "" });
    try {
      const r = await dataprepApi.save(buildRecipe(), name, rowLimit);
      let successText = t("dataPrep.saveSuccessMsg", { name: r.data.name, rows: r.data.rowCount });
      if (r.data.truncated) {
        successText += t("dataPrep.saveSuccessTruncatedSuffix", { limit: r.data.rowLimit });
      }
      setSaveProgress({ open: true, phase: "done", errorText: "", successText });
    } catch (e) {
      setSaveProgress({ open: true, phase: "error", errorText: e.message, successText: "" });
    }
  }

  function ColRow({ tableKey, col }) {
    const key = keyOf(tableKey, col.name);
    const st = colState[key] || { included: false, as: col.name, type: "" };
    return (
      <tr className="border-t border-gray-100">
        <td className="px-2 py-1.5">
          <input type="checkbox" checked={!!st.included} onChange={(e) => setCol(key, { included: e.target.checked })} />
        </td>
        <td className="px-2 py-1.5 font-mono text-xs text-gray-500 whitespace-nowrap">{col.name}</td>
        <td className="px-2 py-1.5">
          <input value={st.as} disabled={!st.included} onChange={(e) => setCol(key, { as: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1 text-xs disabled:bg-gray-50 disabled:text-gray-400" />
        </td>
        <td className="px-2 py-1.5">
          <select value={st.type} disabled={!st.included} onChange={(e) => setCol(key, { type: e.target.value })}
            className="border border-gray-300 rounded px-1.5 py-1 text-xs bg-white disabled:bg-gray-50 disabled:text-gray-400">
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{lang === "en" ? o.enLabel : o.idLabel}</option>)}
          </select>
        </td>
      </tr>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <PageHeader title={t("dataPrep.pageTitle")} subtitle={t("dataPrep.pageSubtitle")} />

      {loadErr && <div className="mb-4"><Notice kind="error">{loadErr}</Notice></div>}

      {/* 1. Tabel sumber */}
      <Card className="p-4 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge color="teal">1</Badge>
          <p className="font-semibold text-gray-900 text-sm">{t("dataPrep.step1Title")}</p>
        </div>
        {loadingTables ? <Spinner label={t("dataPrep.loadingTablesLabel")} /> : (
          <select value={sourceTable} onChange={(e) => setSourceTable(e.target.value)}
            className="w-full max-w-md border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white">
            <option value="">{t("dataPrep.pickTablePlaceholder")}</option>
            {tables.map((tb) => (
              <option key={tb.name} value={tb.name}>
                {tb.label ? `${tb.label} (${tb.name})` : tb.name} ({Number(tb.row_count).toLocaleString("id")})
              </option>
            ))}
          </select>
        )}
      </Card>

      {sourceTable && (
        <>
          {/* 2. Kolom sumber */}
          <Card className="p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge color="teal">2</Badge>
              <p className="font-semibold text-gray-900 text-sm">{t("dataPrep.step2Title")}</p>
            </div>
            <p className="text-xs text-gray-500 mb-2">{t("dataPrep.step2Desc")}</p>
            <div className="overflow-auto max-h-64 border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-500 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 w-8"></th>
                    <th className="px-2 py-1.5">{t("dataPrep.colOriginalHeader")}</th>
                    <th className="px-2 py-1.5">{t("dataPrep.colRenameHeader")}</th>
                    <th className="px-2 py-1.5">{t("dataPrep.colTypeHeader")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sourceCols.map((c) => <ColRow key={c.name} tableKey="source" col={c} />)}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 3. JOIN opsional */}
          <Card className="p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge color="teal">3</Badge>
              <p className="font-semibold text-gray-900 text-sm">{t("dataPrep.step3Title")}</p>
              <label className="ml-auto flex items-center gap-1.5 text-xs text-gray-600">
                <input type="checkbox" checked={joinOn} onChange={(e) => setJoinOn(e.target.checked)} />
                {t("dataPrep.joinEnableLabel")}
              </label>
            </div>

            {!joinOn ? (
              <p className="text-xs text-gray-400">{t("dataPrep.step3Desc")}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={joinTable} onChange={(e) => setJoinTable(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs bg-white">
                    <option value="">{t("dataPrep.pickJoinTablePlaceholder")}</option>
                    {tables.filter((tb) => tb.name !== sourceTable).map((tb) => (
                      <option key={tb.name} value={tb.name}>
                        {tb.label ? `${tb.label} (${tb.name})` : tb.name}
                        {suggestedRelations.some((r) => r.refTable === tb.name) ? ` — ${t("dataPrep.suggestedSuffix")}` : ""}
                      </option>
                    ))}
                  </select>
                  {joinTable && (
                    <>
                      <span className="text-xs text-gray-400">{t("dataPrep.joinOnPrefix")}</span>
                      <select value={joinLeftCol} onChange={(e) => setJoinLeftCol(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono">
                        {sourceCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                      <span className="text-xs text-gray-400">=</span>
                      <select value={joinRightCol} onChange={(e) => setJoinRightCol(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono">
                        {joinCols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                      <select value={joinType} onChange={(e) => setJoinType(e.target.value)}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                        <option value="LEFT">LEFT JOIN</option>
                        <option value="INNER">INNER JOIN</option>
                      </select>
                    </>
                  )}
                </div>

                {joinTable && joinCols.length > 0 && (
                  <div className="overflow-auto max-h-56 border border-gray-100 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 text-left text-gray-500 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 w-8"></th>
                          <th className="px-2 py-1.5">{t("dataPrep.colOriginalHeader")}</th>
                          <th className="px-2 py-1.5">{t("dataPrep.colRenameHeader")}</th>
                          <th className="px-2 py-1.5">{t("dataPrep.colTypeHeader")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {joinCols.map((c) => <ColRow key={c.name} tableKey="join" col={c} />)}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* 4. Filter baris (opsional) */}
          <Card className="p-4 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge color="teal">4</Badge>
              <p className="font-semibold text-gray-900 text-sm">{t("dataPrep.step4Title")}</p>
              <Btn variant="ghost" className="!px-2.5 !py-1 text-xs ml-auto" onClick={addFilter}>
                {t("dataPrep.addFilterButton")}
              </Btn>
            </div>
            <p className="text-xs text-gray-500 mb-2">{t("dataPrep.step4Desc")}</p>

            {filters.length === 0 ? (
              <p className="text-xs text-gray-400">{t("dataPrep.noFiltersHint")}</p>
            ) : (
              <div className="space-y-2">
                {filters.map((f, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2">
                    <select
                      value={keyOf(f.table, f.column)}
                      onChange={(e) => {
                        const [tbl, ...rest] = e.target.value.split("::");
                        updateFilter(idx, { table: tbl, column: rest.join("::") });
                      }}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white font-mono max-w-[220px]"
                    >
                      <option value="::">{t("dataPrep.filterColumnPlaceholder")}</option>
                      {filterableCols.map((c) => (
                        <option key={keyOf(c.table, c.column)} value={keyOf(c.table, c.column)}>
                          {c.table === "join" ? "⤷ " : ""}{c.column}
                        </option>
                      ))}
                    </select>
                    <select
                      value={f.op}
                      onChange={(e) => updateFilter(idx, { op: e.target.value, value: FILTER_OPS_NO_VALUE.has(e.target.value) ? "" : f.value })}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white"
                    >
                      {FILTER_OP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{t(`dataPrep.filterOp.${o.value}`)}</option>
                      ))}
                    </select>
                    {!FILTER_OPS_NO_VALUE.has(f.op) && (
                      <input
                        value={f.value}
                        onChange={(e) => updateFilter(idx, { value: e.target.value })}
                        placeholder={t("dataPrep.filterValuePlaceholder")}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs flex-1 min-w-[100px]"
                      />
                    )}
                    <button type="button" onClick={() => removeFilter(idx)}
                      className="text-xs text-red-500 hover:text-red-700 px-1.5">
                      {t("dataPrep.removeFilterLabel")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 5. Pratinjau + simpan */}
          <Card className="p-4 mb-6">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge color="teal">5</Badge>
              <p className="font-semibold text-gray-900 text-sm">{t("dataPrep.step5Title")}</p>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-500" title={t("dataPrep.rowLimitHint")}>
                  {t("dataPrep.rowLimitLabel")}
                  <select value={rowLimit} onChange={(e) => setRowLimit(Number(e.target.value))}
                    className="border border-gray-300 rounded-lg px-1.5 py-1 text-xs bg-white">
                    <option value={1000}>1.000</option>
                    <option value={10000}>10.000</option>
                    <option value={50000}>50.000</option>
                    <option value={100000}>100.000 ({t("dataPrep.rowLimitMaxSuffix")})</option>
                  </select>
                </label>
                <Btn variant="ghost" className="!px-3 !py-1.5 text-xs" disabled={!canPreview || previewing} onClick={doPreview}>
                  {previewing ? t("dataPrep.previewingLabel") : t("dataPrep.previewButton")}
                </Btn>
                <Btn variant="primary" className="!px-3 !py-1.5 text-xs" disabled={!preview} onClick={() => setSavePrompt(true)}>
                  {t("dataPrep.saveButton")}
                </Btn>
              </div>
            </div>

            {previewErr && <div className="mb-2"><Notice kind="error">{previewErr}</Notice></div>}

            {!preview && !previewErr && (
              <p className={`text-xs ${blockReason ? "text-amber-600" : "text-gray-400"}`}>
                {blockReason || t("dataPrep.previewHint")}
              </p>
            )}

            {preview && (
              <div className="overflow-auto max-h-80 rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-600 sticky top-0">
                    <tr>{preview.columns.map((c) => <th key={c} className="px-2 py-1.5 font-mono font-semibold whitespace-nowrap">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-gray-100 hover:bg-gray-50">
                        {preview.columns.map((c) => (
                          <td key={c} className="px-2 py-1 whitespace-nowrap max-w-[220px] truncate">
                            {row[c] != null ? String(row[c]) : <span className="text-gray-300">NULL</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length === 0 && <p className="text-xs text-gray-400 p-3">{t("dataPrep.previewEmpty")}</p>}
              </div>
            )}
          </Card>
        </>
      )}

      <PromptDialog
        open={savePrompt}
        title={t("dataPrep.savePromptTitle")}
        label={t("dataPrep.saveNameLabel")}
        defaultValue={sourceTable}
        confirmLabel={t("dataPrep.saveConfirmLabel")}
        onConfirm={doSave}
        onClose={() => setSavePrompt(false)}
      />

      <ProgressDialog
        open={saveProgress.open}
        title={t("dataPrep.saveProgressTitle")}
        phase={saveProgress.phase}
        simulate
        statusText={t("dataPrep.saveProgressStatus")}
        successText={saveProgress.successText}
        errorText={saveProgress.errorText}
        onClose={() => setSaveProgress((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
