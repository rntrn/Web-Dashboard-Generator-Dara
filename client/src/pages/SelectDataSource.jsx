import { useEffect, useState } from "react";
import { databasesApi } from "../api/databases";
import { chartsApi } from "../api/charts";
import { dashboardsApi } from "../api/dashboards";
import { uploadsApi } from "../api/uploads";
import { connImportsApi } from "../api/connImports";
import { dataprepTablesApi } from "../api/dataprep";
import { useDatabaseStore } from "../stores/databaseStore";
import ChartPreview from "../components/ChartPreview";
import ShareModal from "../components/ShareModal";
import PromptDialog from "../components/PromptDialog";
import ProgressDialog from "../components/ProgressDialog";
import { PageHeader, Card, Spinner, EmptyState, Notice, Badge } from "../components/ui";
import { parseFile, scanData, sanitizeRows } from "../lib/parseTable";
import { getUser } from "../api/http";
import { ui } from "../lib/uiBus";
import { useI18n } from "../i18n/I18nContext.jsx";

const MAX_FILE_MB = 100;
const MAX_ROWS = 100000;

// Pilihan jumlah baris review (B2). "Semua" hanya jika total ≤ cap keras server.
const ROW_LIMITS = [1000, 5000, 10000];

export default function SelectDataSource() {
  const { t } = useI18n();
  // status simpan per-usulan: { [index]: "saving"|"saved"|"error" }
  const [saveState, setSaveState] = useState({});
  const [rowLimit, setRowLimit] = useState(1000); // batas baris contoh aktif

  // Auto-dashboard: popup nama sebelum dibuat + progres pembuatan
  // (progres SIMULASI — lihat catatan di ProgressDialog.jsx — karena buat
  // dashboard otomatis satu request server yang selesai sekaligus, bukan
  // bertahap seperti unggah file yang punya persen ASLI).
  const [dashPrompt, setDashPrompt] = useState(null); // { table } | null
  const [dashProgress, setDashProgress] = useState({ open: false, phase: "running", errorText: "", successText: "" });

  // Upload CSV/Excel (#2)
  const me = getUser();
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const [uploads, setUploads] = useState([]);       // tabel upload milik/dibagikan
  const [parsed, setParsed] = useState(null);        // { name, columns, rows, sheetNames, sheet, scan }
  const [parsedFile, setParsedFile] = useState(null); // File asli (untuk ganti sheet)
  const [cleanRisky, setCleanRisky] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");     // pesan validasi cepat (file terlalu besar, dst)
  // Progres UNGGAH — persen ASLI dari event XHR (lihat uploadsApi.create).
  const [uploadProgress, setUploadProgress] = useState({ open: false, phase: "running", percent: 0, errorText: "" });
  const uploading = uploadProgress.open && uploadProgress.phase === "running";
  const [shareItem, setShareItem] = useState(null);

  function loadUploads() {
    uploadsApi.status().then((r) => setUploadEnabled(!!r.data?.enabled)).catch(() => {});
    uploadsApi.list().then((r) => setUploads(r.data || [])).catch(() => {});
  }
  useEffect(() => { loadUploads(); }, []);

  // Tabel hasil import Data Connection (Fase 1) — pola sama seperti uploads
  // di atas, TAPI tidak digerbangi toggle uploadEnabled (fitur beda, admin
  // yang mengelola koneksi & memicu impor di halaman Data Connection —
  // lihat ConnectionsPage.jsx). Kartu di sini cuma untuk MEMAKAI hasilnya.
  const [connImports, setConnImports] = useState([]);
  const [shareConnItem, setShareConnItem] = useState(null);
  function loadConnImports() {
    connImportsApi.list().then((r) => setConnImports(r.data || [])).catch(() => {});
  }
  useEffect(() => { loadConnImports(); }, []);
  const canManageConnImport = (u) => me && (me.role === "admin" || (u.createdBy && u.createdBy.nip === me.nip));
  async function removeConnImport(u) {
    if (!confirm(t("selectDataSource.confirmDeleteUploadedTable", { name: u.name }))) return;
    try {
      await connImportsApi.remove(u.id);
      loadConnImports();
      databasesApi.listTables().then((res) => setTables(res.data)).catch(() => {});
    } catch (err) { setUploadMsg(t("selectDataSource.failedDeleteWithMsg", { msg: err.message })); }
  }

  // Tabel hasil Data Preparation (Fase 2) — pola sama persis. Memicu
  // preview/save dilakukan admin di halaman Data Preparation; di sini
  // cuma pakai/bagikan/hapus.
  const [dataprepTables, setDataprepTables] = useState([]);
  const [sharePrepItem, setSharePrepItem] = useState(null);
  function loadDataprepTables() {
    dataprepTablesApi.list().then((r) => setDataprepTables(r.data || [])).catch(() => {});
  }
  useEffect(() => { loadDataprepTables(); }, []);
  const canManagePrepTable = (u) => me && (me.role === "admin" || (u.createdBy && u.createdBy.nip === me.nip));
  async function removeDataprepTable(u) {
    if (!confirm(t("selectDataSource.confirmDeleteUploadedTable", { name: u.name }))) return;
    try {
      await dataprepTablesApi.remove(u.id);
      loadDataprepTables();
      databasesApi.listTables().then((res) => setTables(res.data)).catch(() => {});
    } catch (err) { setUploadMsg(t("selectDataSource.failedDeleteWithMsg", { msg: err.message })); }
  }

  /** Baca file (CSV/Excel), pindai keamanan, tampilkan review. */
  async function handleFile(file, sheetName) {
    setUploadMsg("");
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      const msg = t("selectDataSource.fileTooLarge", { max: MAX_FILE_MB });
      setUploadMsg(msg); ui.toast(msg, { kind: "error" }); return;
    }
    try {
      const { columns, rows, sheetNames, sheet } = await parseFile(file, sheetName);
      if (!columns.length) {
        const msg = t("selectDataSource.fileOrSheetEmpty");
        setUploadMsg(msg); ui.toast(msg, { kind: "error" }); return;
      }
      if (rows.length > MAX_ROWS) {
        const msg = t("selectDataSource.tooManyRows", {
          count: rows.length.toLocaleString("id"), max: MAX_ROWS.toLocaleString("id"),
        });
        setUploadMsg(msg); ui.toast(msg, { kind: "error" }); return;
      }
      const scan = scanData(columns, rows);
      setParsedFile(file);
      setCleanRisky(true);
      setParsed({
        // Nama tabel bawaan = nama file (tanpa ekstensi) — tetap bisa diedit
        // di kotak "Nama tabel" sebelum tombol Simpan diklik (lihat di bawah).
        name: (sheetName ? sheet : file.name.replace(/\.[^.]+$/, "")).slice(0, 60),
        columns, rows, sheetNames, sheet, scan,
      });
    } catch (err) {
      setUploadMsg(err.message);
      ui.reportError(t("selectDataSource.failedReadFile"), err);
    }
  }

  function onPickFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) handleFile(file);
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  /** Ganti sheet (Excel) → baca ulang file. */
  function changeSheet(name) { if (parsedFile) handleFile(parsedFile, name); }

  async function doUpload() {
    if (!parsed) return;
    setUploadMsg("");
    setUploadProgress({ open: true, phase: "running", percent: 0, errorText: "" });
    try {
      const risky = parsed.scan?.total > 0;
      const rows = risky && cleanRisky ? sanitizeRows(parsed.rows) : parsed.rows;
      await uploadsApi.create(
        { name: parsed.name, columns: parsed.columns, rows },
        (pct) => setUploadProgress((p) => ({ ...p, percent: pct }))
      );
      setUploadProgress({ open: true, phase: "done", percent: 100, errorText: "" });
      setParsed(null); setParsedFile(null);
      loadUploads();
      databasesApi.listTables().then((res) => setTables(res.data)).catch(() => {});
    } catch (err) {
      setUploadProgress((p) => ({ ...p, phase: "error", errorText: err.message }));
      ui.reportError(t("selectDataSource.failedUploadTable"), err);
    }
  }

  async function removeUpload(u) {
    if (!confirm(t("selectDataSource.confirmDeleteUploadedTable", { name: u.name }))) return;
    try {
      await uploadsApi.remove(u.id);
      loadUploads();
      databasesApi.listTables().then((res) => setTables(res.data)).catch(() => {});
    } catch (err) { setUploadMsg(t("selectDataSource.failedDeleteWithMsg", { msg: err.message })); }
  }
  const canManageUpload = (u) => me && (me.role === "admin" || (u.createdBy && u.createdBy.nip === me.nip));

  /** Ubah usulan otomatis menjadi spesifikasi chart lalu simpan. */
  async function saveSuggestion(s, idx, table) {
    setSaveState((p) => ({ ...p, [idx]: "saving" }));
    try {
      await chartsApi.create({
        name: s.title || `${s.chartType} ${table}`,
        table,
        chartType: s.chartType,
        dimensions: s.dimension ? [s.dimension] : (s.dimensions || []),
        measures: s.measure ? [s.measure] : (s.measures || []),
        aggregation: s.aggregation || "COUNT",
        join: s.join || null,
      });
      setSaveState((p) => ({ ...p, [idx]: "saved" }));
    } catch {
      setSaveState((p) => ({ ...p, [idx]: "error" }));
    }
  }

  /** Buat dashboard otomatis dari tabel terpilih (simpan chart + susun grid). */
  async function makeAutoDashboard(table, name) {
    setDashProgress({ open: true, phase: "running", errorText: "", successText: "" });
    try {
      const r = await dashboardsApi.auto(table, name);
      const d = r.data.dashboard;
      setDashProgress({
        open: true, phase: "done", errorText: "",
        successText: t("selectDataSource.autoDashboardCreated", { name: d.name, count: r.data.chartCount }),
      });
    } catch (e) {
      setDashProgress({ open: true, phase: "error", errorText: e.message, successText: "" });
      ui.reportError(t("selectDataSource.failedAutoDashboard"), e);
    }
  }
  const {
    tables,
    selectedTable,
    schema,
    suggestions,
    loading,
    error,
    setTables,
    setSelectedTable,
    setSchema,
    setSuggestions,
    setLoading,
    setError
  } = useDatabaseStore();

  // Load tables on mount
  useEffect(() => {
    setLoading(true);
    databasesApi
      .listTables()
      .then((res) => {
        setTables(res.data);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [setTables, setError, setLoading]);

  /** Muat skema + contoh data sebuah tabel dengan batas baris tertentu. */
  const loadSchema = (tableName, limit) => {
    setLoading(true);
    databasesApi
      .getSchema(tableName, limit)
      .then((res) => { setSchema(res.data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  // Load schema + usulan chart saat tabel dipilih (batas baris reset ke 1000)
  const handleSelectTable = (tableName) => {
    setSelectedTable(tableName);
    setSuggestions(null);
    setSaveState({});
    setRowLimit(1000);
    loadSchema(tableName, 1000);

    // Usulan chart diambil paralel (tidak memblok tampilan skema)
    databasesApi
      .getSuggestions(tableName)
      .then((res) => setSuggestions(res.data.suggestions))
      .catch(() => setSuggestions([]));
  };

  /** Ganti batas baris & muat ulang contoh data tabel yang sedang dipilih. */
  const changeRowLimit = (limit) => {
    setRowLimit(limit);
    if (selectedTable) loadSchema(selectedTable, limit);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <PageHeader title={t("selectDataSource.pageTitle")}
        subtitle={t("selectDataSource.pageSubtitle")} />

      <div className="mb-4"><Notice>{error}</Notice></div>

      {/* Upload CSV/Excel (#2) — bila modul diaktifkan admin */}
      {uploadEnabled && (
        <Card className="p-4 mb-5">
          {/* Zona drag & drop */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
              dragOver ? "border-teal-500 bg-teal-50" : "border-gray-300 bg-gray-50"}`}>
            <p className="text-sm text-gray-600">
              {t("selectDataSource.dragDropText")} <b>{t("selectDataSource.dragDropFormats")}</b>{" "}
              {t("selectDataSource.dragDropSuffix")}{" "}
              <label className="text-teal-600 font-semibold cursor-pointer underline">
                {t("selectDataSource.chooseFileLabel")}
                <input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={onPickFile} />
              </label>
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {t("selectDataSource.uploadLimits", { maxMb: MAX_FILE_MB, maxRows: MAX_ROWS.toLocaleString("id") })}{" "}
              <code>dara_data_upl_</code>{t("selectDataSource.uploadLimitsSuffix")}
            </p>
          </div>

          {/* Review + cek keamanan sebelum simpan */}
          {parsed && (() => {
            const risky = parsed.scan?.total > 0;
            return (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                {/* Nama tabel — otomatis dari nama file, WAJIB diperiksa/diubah
                    di sini SEBELUM tabel dibuat & datanya dimasukkan. */}
                <div className="flex flex-wrap items-center gap-2 mb-3 pb-3 border-b border-gray-200">
                  <label className="text-xs font-semibold text-gray-600 shrink-0">
                    {t("selectDataSource.tableNameLabel")} <span className="text-gray-400 font-normal">{t("selectDataSource.tableNameHint")}</span>:
                  </label>
                  <input value={parsed.name} onChange={(e) => setParsed({ ...parsed, name: e.target.value })}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm font-semibold w-72 focus:ring-2 focus:ring-teal-300 outline-none" />
                </div>

                {/* Ringkasan review */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 mb-2">
                  <span><b>{parsed.rows.length.toLocaleString("id")}</b> {t("selectDataSource.rowsLabel")}</span>
                  <span><b>{parsed.columns.length}</b> {t("selectDataSource.columnsLabel")}</span>
                  {parsed.sheetNames.length > 1 ? (
                    <span className="flex items-center gap-1">{t("selectDataSource.sheetLabel")}
                      <select value={parsed.sheet} onChange={(e) => changeSheet(e.target.value)}
                        className="border border-gray-300 rounded px-1 py-0.5">
                        {parsed.sheetNames.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </span>
                  ) : <span>{t("selectDataSource.sheetLabel")} <b>{parsed.sheet}</b></span>}
                </div>

                {/* Nama kolom */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {parsed.columns.map((c, i) => (
                    <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">{c}</span>
                  ))}
                </div>

                {/* Hasil pemindaian keamanan */}
                {risky ? (
                  <div className="mb-2 text-xs bg-amber-50 border border-amber-300 text-amber-800 rounded-lg px-3 py-2">
                    {t("selectDataSource.riskyFoundPrefix")} <b>{parsed.scan.total}</b> {t("selectDataSource.riskyFoundMiddle")}
                    {" "}{t("selectDataSource.riskyBreakdown", { formula: parsed.scan.formula, script: parsed.scan.script })}
                    <div className="mt-1 font-mono text-[10px] text-amber-900/80">
                      {parsed.scan.samples.map((s, i) => (
                        <div key={i} className="truncate">
                          {t("selectDataSource.riskySampleLine", { r: s.r, c: s.c, kind: s.kind, value: s.value })}
                        </div>
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5 mt-1.5 text-amber-900">
                      <input type="checkbox" checked={cleanRisky} onChange={(e) => setCleanRisky(e.target.checked)} />
                      {t("selectDataSource.cleanRiskyLabel")}
                    </label>
                  </div>
                ) : (
                  <div className="mb-2 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5">
                    {t("selectDataSource.scanCleanMessage")}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <button onClick={doUpload} disabled={uploading || !parsed.name.trim() || (risky && !cleanRisky)}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40"
                    title={risky && !cleanRisky ? t("selectDataSource.checkCleanFirstTooltip") : ""}>
                    {uploading ? t("selectDataSource.uploadingLabel")
                      : (risky && cleanRisky ? t("selectDataSource.cleanAndUploadLabel") : t("selectDataSource.saveToTableLabel"))}
                  </button>
                  <button onClick={() => { setParsed(null); setParsedFile(null); }} className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm">{t("common.cancel")}</button>
                </div>

                {/* Pratinjau isi (8 baris) */}
                <div className="overflow-auto max-h-40 rounded border border-gray-200 bg-white">
                  <table className="text-xs">
                    <thead className="bg-gray-50"><tr>{parsed.columns.map((c, i) => (
                      <th key={i} className="px-2 py-1 text-left font-mono whitespace-nowrap">{c}</th>))}</tr></thead>
                    <tbody>{parsed.rows.slice(0, 8).map((r, ri) => (
                      <tr key={ri} className="border-t border-gray-100">{r.map((v, ci) => (
                        <td key={ci} className="px-2 py-0.5 whitespace-nowrap max-w-[200px] truncate">{String(v)}</td>))}</tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          {uploadMsg && <p className="text-sm mt-2 text-gray-600">{uploadMsg}</p>}

          {/* Daftar tabel upload milik/dibagikan */}
          {uploads.length > 0 && (
            <div className="mt-3">
              <span className="text-xs font-semibold text-gray-500">{t("selectDataSource.myUploadsLabel")}</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {uploads.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800">
                    <span className="cursor-pointer" onClick={() => handleSelectTable(u.tableName)} title={t("selectDataSource.rowCountTooltip", { count: u.rowCount })}>
                      📄 {u.name}
                    </span>
                    {canManageUpload(u) && <button onClick={() => setShareItem(u)} title={t("selectDataSource.shareTooltip")}>👥</button>}
                    {canManageUpload(u) && <button onClick={() => removeUpload(u)} title={t("selectDataSource.deleteTooltip")} className="text-red-500">✕</button>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Tabel hasil import Data Connection (Fase 1) — cuma tampil kalau ada
          yang boleh diakses user ini (ACL sama seperti upload: privat,
          kecuali dibagikan). Memicu import baru dilakukan admin di halaman
          Data Connection, bukan di sini — di sini cuma pakai/bagikan/hapus. */}
      {connImports.length > 0 && (
        <Card className="p-4 mb-5">
          <span className="text-xs font-semibold text-gray-500">{t("selectDataSource.connImportsLabel")}</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {connImports.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-800">
                <span className="cursor-pointer" onClick={() => handleSelectTable(u.tableName)} title={t("selectDataSource.rowCountTooltip", { count: u.rowCount })}>
                  🔌 {u.name}
                </span>
                {canManageConnImport(u) && <button onClick={() => setShareConnItem(u)} title={t("selectDataSource.shareTooltip")}>👥</button>}
                {canManageConnImport(u) && <button onClick={() => removeConnImport(u)} title={t("selectDataSource.deleteTooltip")} className="text-red-500">✕</button>}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Tabel hasil Data Preparation (Fase 2) — sama pola, ikon beda. */}
      {dataprepTables.length > 0 && (
        <Card className="p-4 mb-5">
          <span className="text-xs font-semibold text-gray-500">{t("selectDataSource.dataprepTablesLabel")}</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {dataprepTables.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-violet-50 border border-violet-200 text-violet-800">
                <span className="cursor-pointer" onClick={() => handleSelectTable(u.tableName)} title={t("selectDataSource.rowCountTooltip", { count: u.rowCount })}>
                  🧪 {u.name}
                </span>
                {canManagePrepTable(u) && <button onClick={() => setSharePrepItem(u)} title={t("selectDataSource.shareTooltip")}>👥</button>}
                {canManagePrepTable(u) && <button onClick={() => removeDataprepTable(u)} title={t("selectDataSource.deleteTooltip")} className="text-red-500">✕</button>}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Grid tabel — kartu diperkecil & lebih rapat (#2) */}
      {loading && !tables.length ? (
        <Spinner label={t("selectDataSource.loadingTablesLabel")} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 mb-8">
          {tables.map((table) => (
            <Card
              key={table.name}
              onClick={() => handleSelectTable(table.name)}
              className={`p-3 cursor-pointer transition-all hover:shadow-md ${
                selectedTable === table.name ? "ring-2 ring-blue-500 border-blue-300" : ""
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-sm shrink-0">🗃️</span>
                <h3 className="font-semibold text-gray-800 text-sm truncate" title={table.name}>{table.label || table.name}</h3>
              </div>
              {table.label && (
                <p className="text-gray-300 text-[10px] font-mono truncate" title={table.name}>{table.name}</p>
              )}
              <p className="text-gray-400 text-xs mt-0.5">{Number(table.row_count).toLocaleString("id")} {t("selectDataSource.rowsLabel")}</p>
            </Card>
            ))}
          </div>
        )}

      {shareItem && (
        <ShareModal module="uploads" item={shareItem}
          onClose={() => setShareItem(null)} onSaved={() => loadUploads()} />
      )}

      {shareConnItem && (
        <ShareModal module="conn-imports" item={shareConnItem}
          onClose={() => setShareConnItem(null)} onSaved={() => loadConnImports()} />
      )}

      {sharePrepItem && (
        <ShareModal module="dataprep-tables" item={sharePrepItem}
          onClose={() => setSharePrepItem(null)} onSaved={() => loadDataprepTables()} />
      )}

      {/* Progres UNGGAH file — persen ASLI dari XHR (uploadsApi.create). */}
      <ProgressDialog
        open={uploadProgress.open}
        title={t("selectDataSource.uploadProgressTitle")}
        phase={uploadProgress.phase}
        percent={uploadProgress.percent}
        statusText={t("selectDataSource.uploadProgressStatus", { name: parsed?.name || "" })}
        successText={t("selectDataSource.uploadProgressSuccess")}
        errorText={uploadProgress.errorText}
        onClose={() => setUploadProgress((p) => ({ ...p, open: false }))}
        onRetry={() => { setUploadProgress((p) => ({ ...p, open: false })); doUpload(); }}
      />

      {/* Popup: minta nama dashboard SEBELUM dibuat (bukan otomatis "Auto: <tabel>" tanpa ditanya). */}
      <PromptDialog
        open={!!dashPrompt}
        title={t("selectDataSource.dashboardNamePromptTitle")}
        message={<>{t("selectDataSource.dashboardNamePromptMessagePrefix")} <b>{dashPrompt?.table}</b>.</>}
        label={t("selectDataSource.dashboardNameLabel")}
        defaultValue={dashPrompt ? `Auto: ${dashPrompt.table}` : ""}
        placeholder={t("selectDataSource.dashboardNamePlaceholder")}
        confirmLabel={t("selectDataSource.createDashboardConfirmLabel")}
        onConfirm={(name) => { const tbl = dashPrompt.table; setDashPrompt(null); makeAutoDashboard(tbl, name); }}
        onClose={() => setDashPrompt(null)}
      />

      {/* Progres PEMBUATAN DASHBOARD OTOMATIS — persen SIMULASI (lihat catatan di ProgressDialog.jsx). */}
      <ProgressDialog
        open={dashProgress.open}
        title={t("selectDataSource.autoDashboardProgressTitle")}
        phase={dashProgress.phase}
        simulate
        statusText={t("selectDataSource.autoDashboardProgressStatus")}
        successText={dashProgress.successText}
        errorText={dashProgress.errorText}
        onClose={() => setDashProgress((p) => ({ ...p, open: false }))}
      />

      {/* Detail Skema */}
      {selectedTable && schema && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xl font-bold text-gray-900">{selectedTable}</h2>
            <Badge color="gray">{schema.count} {t("selectDataSource.rowsLabel")}</Badge>
          </div>

          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("selectDataSource.columnsHeading")}</h3>
          <div className="overflow-x-auto rounded-lg border border-gray-100 mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-2 font-semibold">{t("selectDataSource.colNameHeader")}</th>
                  <th className="px-4 py-2 font-semibold">{t("selectDataSource.colTypeHeader")}</th>
                  <th className="px-4 py-2 font-semibold">{t("selectDataSource.colNullableHeader")}</th>
                  <th className="px-4 py-2 font-semibold">{t("selectDataSource.colPkHeader")}</th>
                </tr>
              </thead>
              <tbody>
                {schema.columns.map((col) => (
                  <tr key={col.name} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-mono text-gray-900">{col.name}</td>
                    <td className="px-4 py-2 text-gray-500">{col.type}</td>
                    <td className="px-4 py-2 text-gray-500">{col.nullable ? t("common.yes") : t("common.no")}</td>
                    <td className="px-4 py-2 text-gray-500">{col.pk ? "✓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Review data: kontrol batas baris + peringatan jumlah baris */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="text-sm font-semibold text-gray-700 mr-1">
              {t("selectDataSource.reviewDataHeading")} <span className="text-gray-400 font-normal">
                {t("selectDataSource.reviewDataCount", {
                  shown: schema.sample.length.toLocaleString("id"),
                  total: Number(schema.count).toLocaleString("id"),
                })}
              </span>
            </h3>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs text-gray-500">{t("selectDataSource.showLabel")}</span>
              {ROW_LIMITS.map((n) => (
                <button key={n} onClick={() => changeRowLimit(n)}
                  className={`text-xs px-2 py-1 rounded border ${rowLimit === n
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-teal-400"}`}>
                  {n.toLocaleString("id")}
                </button>
              ))}
              {/* "Semua" hanya bila total ≤ cap keras server */}
              {schema.count <= schema.maxSample ? (
                <button onClick={() => changeRowLimit(schema.maxSample)}
                  className={`text-xs px-2 py-1 rounded border ${rowLimit >= schema.count
                    ? "bg-teal-600 border-teal-600 text-white"
                    : "bg-white border-gray-300 text-gray-600 hover:border-teal-400"}`}>
                  {t("selectDataSource.allLabel")}
                </button>
              ) : (
                <span className="text-xs text-gray-400" title={t("selectDataSource.maxSampleTooltip", { max: schema.maxSample.toLocaleString("id") })}>
                  {t("selectDataSource.tooLargeForAll")}
                </span>
              )}
            </div>
          </div>

          {schema.truncated && (
            <div className="mb-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
              {t("selectDataSource.truncatedPrefix")} <b>{Number(schema.count).toLocaleString("id")}</b> {t("selectDataSource.truncatedMiddle")}{" "}
              <b>{schema.sample.length.toLocaleString("id")}</b>{" "}
              {t("selectDataSource.truncatedSuffix", { max: schema.maxSample.toLocaleString("id") })}
            </div>
          )}

          {schema.sample.length > 0 && (
            <div className="overflow-auto rounded-lg border border-gray-100 max-h-[480px]">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-left text-gray-600 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 font-semibold">#</th>
                    {schema.columns.map((c) => (
                      <th key={c.name} className="px-2 py-1.5 font-semibold whitespace-nowrap font-mono">{c.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schema.sample.map((row, ri) => (
                    <tr key={ri} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-1 text-gray-400">{ri + 1}</td>
                      {schema.columns.map((c) => (
                        <td key={c.name} className="px-2 py-1 text-gray-700 whitespace-nowrap max-w-[240px] truncate"
                          title={row[c.name] != null ? String(row[c.name]) : "NULL"}>
                          {row[c.name] != null ? String(row[c.name]) : <span className="text-gray-300">NULL</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Usulan Chart Otomatis */}
      {selectedTable && suggestions && (
        <Card className="p-6 mt-6">
          <div className="flex items-start justify-between gap-3 mb-1">
            <h2 className="text-xl font-bold text-gray-900">{t("selectDataSource.suggestionsHeading")}</h2>
            {suggestions.length > 0 && (
              <button
                onClick={() => setDashPrompt({ table: selectedTable })}
                disabled={dashProgress.open && dashProgress.phase === "running"}
                className="shrink-0 text-sm px-3 py-2 rounded-lg font-semibold bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                title={t("selectDataSource.autoDashboardButtonTooltip")}>
                {dashProgress.open && dashProgress.phase === "running"
                  ? t("selectDataSource.composingLabel") : t("selectDataSource.createAutoDashboardButton")}
              </button>
            )}
          </div>
          <p className="text-gray-500 mb-2">
            {t("selectDataSource.suggestionsIntro")}{" "}
            <b>{t("selectDataSource.suggestionsIntroSaveWord")}</b>{" "}
            {t("selectDataSource.suggestionsIntroMiddle")}
            <b> {t("selectDataSource.suggestionsIntroAutoDashboardWord")}</b>{" "}
            {t("selectDataSource.suggestionsIntroSuffix")}
          </p>

          {suggestions.length === 0 ? (
            <p className="text-gray-400 text-sm">
              {t("selectDataSource.noSuggestions")}
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {suggestions.map((s, i) => (
                <div key={i} className="relative">
                  <button
                    onClick={() => saveSuggestion(s, i, selectedTable)}
                    disabled={saveState[i] === "saving" || saveState[i] === "saved"}
                    className={`absolute top-2 right-2 z-10 text-xs px-2.5 py-1 rounded-lg font-semibold border transition-colors ${
                      saveState[i] === "saved"
                        ? "bg-green-50 text-green-600 border-green-200"
                        : saveState[i] === "error"
                        ? "bg-red-50 text-red-600 border-red-200"
                        : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                    }`}>
                    {saveState[i] === "saving" ? t("selectDataSource.savingLabel")
                      : saveState[i] === "saved" ? t("selectDataSource.savedLabel")
                      : saveState[i] === "error" ? t("selectDataSource.saveFailedLabel")
                      : t("selectDataSource.saveSuggestionButton")}
                  </button>
                  <ChartPreview table={selectedTable} suggestion={s} />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {selectedTable && loading && <Spinner label={t("selectDataSource.loadingSchemaLabel")} />}
    </div>
  );
}
