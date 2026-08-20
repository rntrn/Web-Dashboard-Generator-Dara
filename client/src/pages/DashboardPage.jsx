import { apiFetch } from "../api/http.js";
import { useEffect, useMemo, useState } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { dashboardsApi } from "../api/dashboards";
import { chartsApi } from "../api/charts";
import { databasesApi } from "../api/databases";
import ChartPreview from "../components/ChartPreview";
import ShareModal from "../components/ShareModal";
import ConfirmDialog from "../components/ConfirmDialog";
import YearPager from "../components/YearPager";
import { THEMES, getTheme } from "../charts/themes";
import { exportNodeToPng, printForPdf } from "../lib/exporter";
import { downloadExport } from "../api/exports";
import { yearPage } from "../lib/yearPage";
import { relativeRange, RELATIVE_PRESETS } from "../lib/relativeDate";
import { autoArrangeLayout } from "../lib/autoArrange";
import { getUser } from "../api/http";
import { useI18n } from "../i18n/I18nContext.jsx";

const Grid = WidthProvider(GridLayout);
const ROW_HEIGHT = 40;

/** Section collapsible untuk tampilan dashboard bergrup (#183). */
function DashSection({ title, count, children }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-xl border border-gray-200 bg-white/40 mb-3">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-50 rounded-t-xl">
        <span className={`text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        <span className="font-semibold text-gray-800">{title}</span>
        <span className="text-xs text-gray-400">({count})</span>
      </button>
      {open && <div className="px-2 pb-2">{children}</div>}
    </section>
  );
}

/** Cek apakah warna latar gelap (untuk memilih teks putih/hitam). */
function isDark(hex) {
  if (!hex) return false;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
}

/**
 * DashboardPage v0.8.0 — perbaikan UX besar:
 *  - Drag pakai HANDLE eksplisit (bar atas widget) -> tak bentrok dgn chart
 *  - Chart mengisi penuh widget & ikut membesar saat resize (ResizeObserver)
 *  - Filter dibuat lewat DROPDOWN tabel+kolom (tanpa menghafal nama kolom)
 *  - Tema warna level dashboard (palet kurasi) -> semua chart senada
 */
export default function DashboardPage() {
  const { t } = useI18n();
  const [dashboards, setDashboards] = useState([]);
  const [savedCharts, setSavedCharts] = useState([]);
  const [current, setCurrent] = useState(null);
  const [editing, setEditing] = useState(false);

  // state edit
  const [name, setName] = useState("");
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState([]);
  const [theme, setTheme] = useState("default");
  const [bgColor, setBgColor] = useState("");   // warna latar dashboard
  const [logo, setLogo] = useState("");         // emoji/teks logo
  const [subtitle, setSubtitle] = useState("");
  const [msg, setMsg] = useState("");

  // pilihan warna latar: kunci i18n + hex ("" = putih/tanpa warna)
  const BG_CHOICES = [
    { key: "white", hex: "" },
    { key: "gray", hex: "#f1f5f9" },
    { key: "lightBlue", hex: "#dbeafe" },
    { key: "lightPurple", hex: "#ede9fe" },
    { key: "lightGreen", hex: "#dcfce7" },
    { key: "lightYellow", hex: "#fef9c3" },
    { key: "lightOrange", hex: "#ffedd5" },
    { key: "pink", hex: "#fee2e2" },
    { key: "darkNavy", hex: "#0f172a" },
    { key: "darkBlue", hex: "#1e3a8a" },
    { key: "darkGreen", hex: "#064e3b" },
    { key: "darkPurple", hex: "#4c1d95" },
  ];

  // pilihan logo (emoji siap klik) + bisa ketik custom
  const LOGO_CHOICES = ["📊", "📈", "📉", "🗂️", "💼", "🏢", "💰", "🎯", "⭐", "🔔", "🌍", "📌", "🧭", "⚡", "🚀", "🏆"];

  // label ramah untuk jenis slicer (v0.21.0)
  const FILTER_TYPE_LABEL = {
    select: t("dashboard.filterTypeSelectLabel"),
    multiselect: t("dashboard.filterTypeMultiselectLabel"),
    daterange: t("dashboard.filterTypeDaterangeLabel"),
  };

  // form tambah filter (dropdown, bukan prompt)
  const [showFilterForm, setShowFilterForm] = useState(false);
  const [filterTable, setFilterTable] = useState("");
  const [filterColumns, setFilterColumns] = useState([]);
  const [filterColumn, setFilterColumn] = useState("");
  const [filterType, setFilterType] = useState("select"); // select|multiselect|daterange

  // form tambah teks
  const [showTextForm, setShowTextForm] = useState(false);
  const [textDraft, setTextDraft] = useState("");

  // state view
  const [activeFilters, setActiveFilters] = useState({});
  const [filterOptions, setFilterOptions] = useState({});

  // state panel bagikan (embed)
  const [showShare, setShowShare] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  // B1: identitas + status modul ACL + item yang sedang dibagikan
  const me = getUser();
  const [aclEnabled, setAclEnabled] = useState(false);
  const [shareItem, setShareItem] = useState(null);
  const [dashYear, setDashYear] = useState("all");
  const [dashPage, setDashPage] = useState(1);

  // Cross-filter antar chart: klik elemen chart -> filter chart lain di
  // dashboard (tabel sama). null = tidak aktif.
  // Bentuk: { itemId, table, column, value }
  const [crossFilter, setCrossFilter] = useState(null);

  // Export-to-Script: panel pilih format + status unduhan.
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  function doExport(format, mode) {
    if (!current) return;
    setExportBusy(true); setExportMsg("");
    const label = mode ? `${format.toUpperCase()} (${mode === "db" ? "DB" : t("dashboard.exportHardcodeWord")})` : format.toUpperCase();
    downloadExport("dashboard", current.id, format, mode)
      .then(() => setExportMsg(t("dashboard.exportSuccessMsg", { format: label })))
      .catch((e) => setExportMsg(t("dashboard.failedWithMsg", { msg: e.message })))
      .finally(() => setExportBusy(false));
  }

  useEffect(() => { refresh(); }, []);

  function refresh() {
    dashboardsApi.list().then((r) => setDashboards(r.data)).catch(() => {});
    chartsApi.list().then((r) => setSavedCharts(r.data)).catch(() => {});
    apiFetch("/api/auth/me").then((r) => r.json())
      .then((j) => setAclEnabled(!!j.data?.aclEnabled)).catch(() => {});
  }

  /** Boleh membagikan item ini? (pemilik/admin & modul ACL aktif) */
  const canShare = (d) => aclEnabled && me &&
    (me.role === "admin" || (d.createdBy && d.createdBy.nip === me.nip));

  async function openDashboard(id) {
    const r = await dashboardsApi.get(id).catch(() => null);
    if (!r) return;
    setCurrent(r.data); setEditing(false); setActiveFilters({}); setCrossFilter(null);
    // opsi slicer dimuat oleh effect cascading di bawah (mengikuti filter aktif).
  }

  /** Toggle cross-filter dari klik chart. Klik nilai yang sama -> matikan. */
  function handleCross(itemId, table, column, value) {
    setCrossFilter((prev) =>
      (prev && prev.itemId === itemId && prev.column === column && prev.value === value)
        ? null
        : { itemId, table, column, value });
  }

  function startNew() {
    setCurrent(null); setEditing(true); setCrossFilter(null);
    setName(""); setItems([]); setFilters([]); setTheme("default");
    setBgColor(""); setLogo(""); setSubtitle(""); setMsg("");
  }

  function startEdit() {
    setEditing(true); setCrossFilter(null);
    setName(current.name);
    setItems(current.items.map(({ chart, ...it }) => ({ ...it })));
    setFilters(current.filters || []);
    setTheme(current.theme || "default");
    setBgColor(current.bgColor || "");
    setLogo(current.logo || "");
    setSubtitle(current.subtitle || "");
    setMsg("");
  }

  function addChart(chartId) {
    if (items.some((i) => i.chartId === chartId)) return;
    setItems([...items, {
      id: `item_${Date.now()}`, kind: "chart", chartId,
      x: 0, y: Infinity, w: 6, h: 8,
    }]);
  }

  function addText() {
    if (!textDraft.trim()) return;
    setItems([...items, {
      id: `item_${Date.now()}`, kind: "text", text: textDraft.trim(),
      x: 0, y: Infinity, w: 6, h: 2,
    }]);
    setTextDraft(""); setShowTextForm(false);
  }

  /** Tabel yang dipakai chart di dashboard ini (kandidat sumber filter). */
  const usedTables = useMemo(() => [...new Set(
    items.filter((i) => i.kind === "chart")
      .map((i) => savedCharts.find((c) => c.id === i.chartId)?.table)
      .filter(Boolean)
  )], [items, savedCharts]);

  /** Saat tabel filter dipilih: muat daftar kolomnya (dropdown, bukan hafalan). */
  useEffect(() => {
    if (!filterTable) { setFilterColumns([]); return; }
    databasesApi.getSchema(filterTable)
      .then((r) => setFilterColumns(r.data.columns))
      .catch(() => setFilterColumns([]));
  }, [filterTable]);

  function addFilter() {
    if (!filterTable || !filterColumn) return;
    setFilters([...filters, {
      id: `filter_${Date.now()}`, table: filterTable, column: filterColumn,
      label: filterColumn.toLowerCase().replace(/_/g, " "),
      type: filterType,
    }]);
    setShowFilterForm(false); setFilterTable(""); setFilterColumn(""); setFilterType("select");
  }

  function onLayoutChange(layout) {
    setItems((prev) => prev.map((it) => {
      const l = layout.find((x) => x.i === it.id);
      return l ? { ...it, x: l.x, y: l.y, w: l.w, h: l.h } : it;
    }));
  }

  /** #183: set nama grup/section sebuah item. */
  function setItemGroup(id, group) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, group: group || null } : it)));
  }
  /** #183: rapikan otomatis (repack grid, kelompok per section). */
  function autoArrange() {
    setItems((prev) => autoArrangeLayout(prev, 12));
    setMsg(t("dashboard.autoArrangedMsg"));
  }

  async function save() {
    if (!name.trim()) { setMsg(t("dashboard.nameRequiredMsg")); return; }
    if (items.length === 0) { setMsg(t("dashboard.itemsRequiredMsg")); return; }
    try {
      const payload = { name, items, filters, theme, bgColor, logo, subtitle };
      const r = current
        ? await dashboardsApi.update(current.id, payload)
        : await dashboardsApi.create(payload);
      setMsg(t("dashboard.savedMsg"));
      refresh();
      openDashboard(r.data.id);
    } catch (e) { setMsg(t("dashboard.failedWithMsg", { msg: e.message })); }
  }

  // Konfirmasi hapus (satuan / massal). null = tertutup.
  const [confirmDel, setConfirmDel] = useState(null); // {kind:"one"|"all", id?, name?, busy?}

  async function removeDash(id) {
    await dashboardsApi.remove(id).catch(() => {});
    if (current?.id === id) setCurrent(null);
    refresh();
  }

  async function doConfirmDelete() {
    if (!confirmDel) return;
    setConfirmDel({ ...confirmDel, busy: true });
    try {
      if (confirmDel.kind === "all") {
        const r = await dashboardsApi.removeAll();
        setCurrent(null);
        setMsg(t("dashboard.allDeletedMsg", { count: r.data.deleted }));
      } else {
        await removeDash(confirmDel.id);
      }
      refresh();
    } catch (e) { setMsg(t("dashboard.failedWithMsg", { msg: e.message })); }
    finally { setConfirmDel(null); }
  }

  /** Buat / putar-ulang kunci embed lalu refresh dashboard aktif. */
  async function regenKey() {
    setShareMsg("");
    try {
      const r = await apiFetch(`/api/dashboards/${current.id}/embed-key`, { method: "POST" });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      await openDashboard(current.id);
      setShowShare(true);
      setShareMsg(t("dashboard.embedKeyRegeneratedMsg"));
    } catch (e) { setShareMsg(t("dashboard.failedWithMsg", { msg: e.message })); }
  }

  /** URL embed lengkap untuk dipakai MANDOR. */
  const embedUrl = current?.embedKey
    ? `${window.location.origin}/view/${current.id}?key=${current.embedKey}`
    : null;

  function copyEmbed() {
    if (!embedUrl) return;
    navigator.clipboard.writeText(embedUrl).then(
      () => setShareMsg(t("dashboard.embedUrlCopiedMsg")),
      () => setShareMsg(t("dashboard.copyFailedMsg"))
    );
  }

  // Ubah nilai slicer aktif -> bentuk yang dipahami backend (v0.21.0):
  //   select     : string            -> { column, value }
  //   multiselect : array string      -> { column, values }
  //   daterange   : { from, to }      -> { column, from, to }
  const backendFilters = useMemo(() => {
    if (!current) return [];
    const out = [];
    for (const f of current.filters || []) {
      const v = activeFilters[f.id];
      if (f.type === "multiselect") {
        if (Array.isArray(v) && v.length) out.push({ column: f.column, values: v });
      } else if (f.type === "daterange") {
        const from = v?.from, to = v?.to;
        if (from || to) out.push({ column: f.column, from: from || undefined, to: to || undefined });
      } else if (v !== undefined && v !== "") {
        out.push({ column: f.column, value: v });
      }
    }
    return out;
  }, [current, activeFilters]);

  // Opsi slicer CASCADING (viewer): dimuat ulang tiap filter berubah, dengan
  // filter LAIN yang aktif (server mengecualikan kolom slicer itu sendiri).
  useEffect(() => {
    if (!current || editing) return;
    let alive = true;
    (async () => {
      const opts = {};
      const fparam = encodeURIComponent(JSON.stringify(backendFilters));
      for (const f of current.filters || []) {
        if (f.type === "daterange") continue;
        try {
          const res = await apiFetch(
            `/api/databases/tables/${f.table}/distinct?column=${f.column}&filters=${fparam}`);
          const json = await res.json();
          opts[f.id] = json.data || [];
        } catch { opts[f.id] = []; }
      }
      if (alive) setFilterOptions(opts);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, editing, JSON.stringify(backendFilters)]);

  /** Render kontrol slicer di viewer sesuai tipe (v0.21.0). */
  function renderSlicer(f) {
    const set = (v) => setActiveFilters({ ...activeFilters, [f.id]: v });
    const inp = "border border-gray-300 rounded-lg px-2 py-1 text-sm";

    if (f.type === "daterange") {
      const val = activeFilters[f.id] || {};
      return (
        <span className="flex items-center gap-1 flex-wrap">
          <input type="date" className={inp} value={val.from || ""}
            onChange={(e) => set({ ...val, from: e.target.value })} />
          <span className="text-gray-400">–</span>
          <input type="date" className={inp} value={val.to || ""}
            onChange={(e) => set({ ...val, to: e.target.value })} />
          {/* Preset relatif (R2-4): set from/to sekaligus */}
          <select className="border border-gray-300 rounded-lg px-1.5 py-1 text-xs text-gray-600"
            value="" title={t("dashboard.relativeRangeTooltip")}
            onChange={(e) => { const r = relativeRange(e.target.value); if (r) set(r); }}>
            <option value="">{t("dashboard.relativeRangeQuickOption")}</option>
            {RELATIVE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </span>
      );
    }

    if (f.type === "multiselect") {
      const sel = activeFilters[f.id] || [];
      const toggle = (v) => set(sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
      return (
        <span className="flex flex-wrap gap-1 max-w-md">
          {(filterOptions[f.id] || []).map((v) => {
            const on = sel.includes(v);
            return (
              <button key={String(v)} type="button" onClick={() => toggle(v)}
                className={`text-xs px-2 py-1 rounded-full border ${on
                  ? "bg-teal-600 border-teal-600 text-white"
                  : "bg-white border-gray-300 text-gray-600 hover:border-teal-400"}`}>
                {String(v)}
              </button>
            );
          })}
          {sel.length > 0 && (
            <button type="button" onClick={() => set([])}
              className="text-xs px-2 py-1 text-red-500">{t("dashboard.clearSelectionButton")}</button>
          )}
        </span>
      );
    }

    // default: select (pilih satu)
    return (
      <select className={inp} value={activeFilters[f.id] ?? ""}
        onChange={(e) => set(e.target.value)}>
        <option value="">{t("dashboard.allOption")}</option>
        {(filterOptions[f.id] || []).map((v) => (
          <option key={String(v)} value={v}>{String(v)}</option>
        ))}
      </select>
    );
  }

  const chartById = (id) => savedCharts.find((c) => c.id === id);
  const layoutOf = (list) => list.map((it) => ({
    i: it.id, x: it.x, y: it.y === Infinity ? 999 : it.y, w: it.w, h: it.h,
    minW: 2, minH: it.kind === "text" ? 1 : 4,
  }));

  const palette = current ? getTheme(current.theme).colors : null;

  /** Render isi satu widget grid. */
  function renderItem(it, isEdit) {
    const removeBtn = isEdit && (
      <button onClick={() => setItems(items.filter((x) => x.id !== it.id))}
        className="text-xs px-1.5 rounded text-red-500 hover:bg-red-50">✕</button>
    );

    if (it.kind === "text") {
      return (
        <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isEdit && (
            <div className="drag-handle cursor-move flex items-center gap-2 px-2 py-1 bg-gray-50 border-b border-gray-100">
              <span className="text-gray-400 text-xs">⠿</span>
              <span className="text-[10px] text-gray-400">{t("dashboard.textItemLabel")}</span>
              <input value={it.group || ""} onChange={(e) => setItemGroup(it.id, e.target.value)}
                onMouseDown={(e) => e.stopPropagation()} placeholder={t("dashboard.groupPlaceholder")}
                className="ml-auto w-20 text-[10px] px-1 py-0.5 border border-gray-200 rounded bg-white"
                title={t("dashboard.groupInputTooltip")} />
              {removeBtn}
            </div>
          )}
          <div className="flex-1 flex items-center px-4">
            <span className="font-bold text-gray-800 text-lg truncate">{it.text}</span>
          </div>
        </div>
      );
    }

    const chart = it.chart || chartById(it.chartId);
    if (!chart) return <div className="p-3 text-xs text-red-500 bg-white rounded-xl border h-full">{t("dashboard.chartDeletedPlaceholder")}</div>;

    if (isEdit) {
      // Mode edit: handle drag di atas, chart di bawah (chart tak menangkap drag)
      return (
        <div className="h-full flex flex-col rounded-xl overflow-hidden border border-blue-200 shadow-sm bg-white">
          <div className="drag-handle cursor-move flex items-center gap-2 px-2 py-1 bg-blue-50 border-b border-blue-100 shrink-0">
            <span className="text-blue-400 text-xs">⠿</span>
            <span className="text-xs font-semibold text-blue-800 truncate flex-1">{chart.name}</span>
            <input value={it.group || ""} onChange={(e) => setItemGroup(it.id, e.target.value)}
              onMouseDown={(e) => e.stopPropagation()} placeholder={t("dashboard.groupPlaceholder")}
              className="w-20 text-[10px] px-1 py-0.5 border border-blue-200 rounded bg-white"
              title={t("dashboard.groupInputTooltip")} />
            {removeBtn}
          </div>
          <div className="flex-1 min-h-0">
            <ChartPreview table={chart.table}
              suggestion={{ ...chart, title: "" }}
              filters={[]} height="fill" palette={getTheme(theme).colors} />
          </div>
        </div>
      );
    }

    // Cross-filter: chart sumber ditandai; chart lain bertabel sama ikut
    // difilter oleh nilai yang diklik. Beda tabel diabaikan (aman dari error).
    const isSource = crossFilter && crossFilter.itemId === it.id;
    const applyCross = crossFilter && crossFilter.itemId !== it.id
      && crossFilter.table === chart.table;
    const itemFilters = applyCross
      ? [...backendFilters, { column: crossFilter.column, value: crossFilter.value }]
      : backendFilters;

    return (
      <div className="h-full">
        <ChartPreview table={chart.table}
          suggestion={{ ...chart, title: chart.name }}
          filters={itemFilters} height="fill" palette={palette}
          onCross={(col, val) => handleCross(it.id, chart.table, col, val)}
          crossActive={!!isSource} />
      </div>
    );
  }

  const btn = "px-3 py-2 rounded-lg text-sm font-medium transition-colors";

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("dashboard.pageTitle")}</h1>
          <p className="text-gray-500">{t("dashboard.pageSubtitle")}</p>
        </div>
        <button onClick={startNew}
          className={`${btn} bg-blue-600 text-white hover:bg-blue-700 font-semibold`}>
          {t("dashboard.newDashboardButton")}
        </button>
      </div>

      {/* Daftar dashboard — filter tahun + pagination (#1) */}
      {dashboards.length > 0 && (() => {
        const v = yearPage(dashboards, { year: dashYear, page: dashPage, pageSize: 24 });
        return (
          <div className="mb-4">
            <YearPager years={v.years} year={dashYear} setYear={setDashYear}
              page={dashPage} setPage={setDashPage} totalPages={v.totalPages} total={v.total} />
            <div className="flex flex-wrap gap-2 items-center">
              {v.pageItems.map((d) => (
                <div key={d.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm transition-colors ${
                    current?.id === d.id ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-300 hover:border-blue-400"
                  }`}>
                  <span className="cursor-pointer" onClick={() => openDashboard(d.id)}>{d.name}</span>
                  {canShare(d) && (
                    <span onClick={() => setShareItem(d)} title={t("dashboard.shareAccessTooltip")}
                      className="opacity-60 hover:opacity-100 cursor-pointer">👥</span>
                  )}
                  <span onClick={() => setConfirmDel({ kind: "one", id: d.id, name: d.name })}
                    title={t("dashboard.deleteThisDashboardTooltip")} className="opacity-50 hover:opacity-100 cursor-pointer">✕</span>
                </div>
              ))}
              <button onClick={() => setConfirmDel({ kind: "all" })}
                className="ml-1 text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50">
                {t("dashboard.deleteAllButton")}
              </button>
            </div>
          </div>
        );
      })()}

      <ConfirmDialog
        open={!!confirmDel}
        title={confirmDel?.kind === "all" ? t("dashboard.confirmDeleteAllTitle") : t("dashboard.confirmDeleteTitle")}
        message={confirmDel?.kind === "all"
          ? t("dashboard.confirmDeleteAllMessage")
          : <>{t("dashboard.confirmDeleteMessagePrefix")} <b>{confirmDel?.name}</b> {t("dashboard.confirmDeleteMessageSuffix")}</>}
        confirmWord={confirmDel?.kind === "all" ? "HAPUS" : null}
        confirmLabel={confirmDel?.kind === "all" ? t("dashboard.deleteAllConfirmLabel") : t("dashboard.deleteConfirmLabel")}
        busy={!!confirmDel?.busy}
        onConfirm={doConfirmDelete}
        onClose={() => setConfirmDel(null)} />

      {shareItem && (
        <ShareModal module="dashboards" item={shareItem}
          onClose={() => setShareItem(null)}
          onSaved={() => refresh()} />
      )}

      {/* ===== MODE EDIT ===== */}
      {editing && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
              value={name} placeholder={t("dashboard.namePlaceholder")}
              onChange={(e) => setName(e.target.value)} />
            <button onClick={() => setShowTextForm(!showTextForm)}
              className={`${btn} border border-gray-300 hover:border-blue-400`}>{t("dashboard.addTextToggle")}</button>
            <button onClick={() => setShowFilterForm(!showFilterForm)}
              className={`${btn} border border-gray-300 hover:border-blue-400`}>{t("dashboard.addFilterToggle")}</button>
            <button onClick={save}
              className={`${btn} bg-blue-600 text-white hover:bg-blue-700 font-semibold`}>{t("dashboard.saveButton")}</button>
            <button onClick={() => setEditing(false)}
              className={`${btn} border border-gray-300 text-gray-500`}>{t("common.cancel")}</button>
          </div>
          {msg && <p className="text-sm text-gray-600 mb-2">{msg}</p>}

          {/* Form teks */}
          {showTextForm && (
            <div className="flex gap-2 mb-3 p-3 bg-gray-50 rounded-lg">
              <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
                value={textDraft} placeholder={t("dashboard.textPlaceholder")}
                onChange={(e) => setTextDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addText()} />
              <button onClick={addText} className={`${btn} bg-gray-800 text-white`}>{t("dashboard.addTextSubmitButton")}</button>
            </div>
          )}

          {/* Form filter: dropdown tabel -> dropdown kolom (tanpa hafalan) */}
          {showFilterForm && (
            <div className="flex flex-wrap gap-2 mb-3 p-3 bg-amber-50 rounded-lg items-center">
              <span className="text-sm font-semibold text-amber-800">{t("dashboard.filterFromLabel")}</span>
              <select className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm"
                value={filterTable} onChange={(e) => { setFilterTable(e.target.value); setFilterColumn(""); }}>
                <option value="">{t("dashboard.selectTablePlaceholder")}</option>
                {usedTables.map((tbl) => <option key={tbl} value={tbl}>{tbl}</option>)}
              </select>
              <select className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm"
                value={filterColumn} onChange={(e) => setFilterColumn(e.target.value)}
                disabled={!filterTable}>
                <option value="">{t("dashboard.selectColumnPlaceholder")}</option>
                {filterColumns.map((c) => (
                  <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                ))}
              </select>
              <select className="border border-amber-300 rounded-lg px-2 py-1.5 text-sm"
                value={filterType} onChange={(e) => setFilterType(e.target.value)}
                disabled={!filterColumn} title={t("dashboard.slicerTypeTooltip")}>
                <option value="select">{t("dashboard.filterTypeSelectOption")}</option>
                <option value="multiselect">{t("dashboard.filterTypeMultiselectOption")}</option>
                <option value="daterange">{t("dashboard.filterTypeDaterangeOption")}</option>
              </select>
              <button onClick={addFilter} disabled={!filterColumn}
                className={`${btn} bg-amber-600 text-white disabled:opacity-40`}>{t("dashboard.addFilterSubmitButton")}</button>
              {usedTables.length === 0 && (
                <span className="text-xs text-amber-700">{t("dashboard.addChartFirstHint")}</span>
              )}
            </div>
          )}

          {/* Filter terpasang */}
          {filters.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {filters.map((f) => (
                <span key={f.id} className="text-xs px-2 py-1 rounded-full bg-amber-100 border border-amber-300 text-amber-800">
                  🔍 {f.label} <span className="opacity-60">· {FILTER_TYPE_LABEL[f.type] || t("dashboard.filterTypeSelectLabel")}</span>
                  <button onClick={() => setFilters(filters.filter((x) => x.id !== f.id))}
                    className="ml-1 text-red-500">✕</button>
                </span>
              ))}
            </div>
          )}

          {/* Tema warna dashboard */}
          <div className="mb-3">
            <span className="text-sm font-semibold text-gray-700 mr-3">{t("dashboard.themeColorLabel")}</span>
            <div className="inline-flex flex-wrap gap-2 align-middle">
              {THEMES.map((th) => (
                <button key={th.id} onClick={() => setTheme(th.id)}
                  title={th.name}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-xs transition-all ${
                    theme === th.id ? "border-gray-900 shadow-sm" : "border-gray-200 hover:border-gray-400"
                  }`}>
                  <span className="flex">
                    {th.colors.slice(0, 4).map((c) => (
                      <span key={c} className="w-3 h-3 rounded-full -ml-1 first:ml-0 border border-white"
                        style={{ backgroundColor: c }} />
                    ))}
                  </span>
                  {th.name}
                </button>
              ))}
            </div>
          </div>

          {/* Tampilan dashboard: logo, subjudul, warna latar */}
          <div className="mb-3 p-4 bg-gray-50 rounded-lg space-y-3">
            {/* Logo emoji siap-klik */}
            <div>
              <span className="text-sm font-semibold text-gray-700 block mb-1.5">{t("dashboard.logoLabel")}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => setLogo("")}
                  className={`w-9 h-9 rounded-lg border text-gray-400 text-xs ${
                    logo === "" ? "border-gray-900 bg-white" : "border-gray-200 bg-white hover:border-gray-400"
                  }`}>{t("dashboard.noLogoButton")}</button>
                {LOGO_CHOICES.map((emo) => (
                  <button key={emo} onClick={() => setLogo(emo)}
                    className={`w-9 h-9 rounded-lg border text-xl leading-none flex items-center justify-center ${
                      logo === emo ? "border-blue-600 bg-blue-50 scale-110" : "border-gray-200 bg-white hover:border-blue-400"
                    }`}>{emo}</button>
                ))}
                <input value={logo} onChange={(e) => setLogo(e.target.value)}
                  placeholder={t("dashboard.logoCustomPlaceholder")} maxLength={8}
                  className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24 text-center ml-1" />
              </div>
            </div>

            {/* Subjudul */}
            <label className="text-sm flex items-center gap-2">
              <span className="font-semibold text-gray-700 shrink-0">{t("dashboard.subtitleLabel")}</span>
              <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
                placeholder={t("dashboard.subtitlePlaceholder")}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm flex-1" />
            </label>

            {/* Warna latar — swatch jelas dengan border + centang */}
            <div>
              <span className="text-sm font-semibold text-gray-700 block mb-1.5">{t("dashboard.bgColorLabel")}</span>
              <div className="flex flex-wrap gap-2">
                {BG_CHOICES.map((c) => (
                  <button key={c.hex || "none"} onClick={() => setBgColor(c.hex)}
                    title={t(`dashboard.bgColor.${c.key}`)}
                    className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all ${
                      bgColor === c.hex ? "border-blue-600 scale-110 shadow" : "border-gray-300 hover:border-gray-500"
                    }`}
                    style={{ backgroundColor: c.hex || "#ffffff" }}>
                    {bgColor === c.hex && (
                      <span className={isDark(c.hex) ? "text-white" : "text-blue-600"}>✓</span>
                    )}
                    {!c.hex && bgColor !== c.hex && <span className="text-[9px] text-gray-400">{t("dashboard.bgColorNoneLabel")}</span>}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Chart tersedia */}
          <div className="flex flex-wrap gap-2 mb-3">
            {savedCharts.filter((c) => !items.some((i) => i.chartId === c.id)).map((c) => (
              <span key={c.id} onClick={() => addChart(c.id)}
                className="text-xs px-2.5 py-1.5 rounded-full border border-gray-300 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors">
                + {c.name}
              </span>
            ))}
          </div>

          {/* Toolbar tata letak (#183): rapikan otomatis + info grup */}
          {items.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <button onClick={autoArrange}
                className="text-xs px-3 py-1.5 rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-50">
                {t("dashboard.autoArrangeButton")}
              </button>
              <span className="text-[11px] text-gray-400">
                {t("dashboard.groupHintPrefix")} <b>{t("dashboard.groupHintBoldWord")}</b> {t("dashboard.groupHintSuffix")}
              </span>
            </div>
          )}

          {/* Grid editor — pola CONTROLLED (layout prop):
              posisi = state items; RGL mengubahnya via onLayoutChange.
              Ini yang membuat drag & resize benar-benar responsif & tersimpan. */}
          <div className="bg-slate-50 rounded-xl border border-dashed border-gray-300 min-h-[240px] p-1">
            <Grid
              className="layout"
              layout={layoutOf(items)}
              cols={12}
              rowHeight={ROW_HEIGHT}
              margin={[12, 12]}
              onLayoutChange={onLayoutChange}
              isDraggable
              isResizable
              draggableHandle=".drag-handle"
              draggableCancel="button,select,input,textarea,a"
              resizeHandles={["se", "e", "s"]}
              compactType="vertical"
              preventCollision={false}
              useCSSTransforms
            >
              {items.map((it) => (
                <div key={it.id}>{renderItem(it, true)}</div>
              ))}
            </Grid>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {t("dashboard.dragHintPrefix")} <b>⠿</b> {t("dashboard.dragHintSuffix")}
          </p>
        </div>
      )}

      {/* ===== MODE LIHAT ===== */}
      {current && !editing && (
        <div id="dash-capture" className="print-area rounded-2xl p-4 -mx-1"
          style={current.bgColor ? { backgroundColor: current.bgColor } : {}}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              {current.logo && <span className="text-3xl">{current.logo}</span>}
              <div>
                <h2 className={`text-2xl font-bold ${isDark(current.bgColor) ? "text-white" : "text-gray-900"}`}>
                  {current.name}
                </h2>
                {current.subtitle && (
                  <p className={`text-sm ${isDark(current.bgColor) ? "text-slate-300" : "text-gray-500"}`}>
                    {current.subtitle}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 no-print">
              <button onClick={() => exportNodeToPng(document.getElementById("dash-capture"), (current.name || "dashboard"))}
                className={`${btn} border border-gray-300 text-gray-600 hover:border-teal-400 bg-white/80`}
                title={t("dashboard.downloadPngTooltip")}>{t("dashboard.pngButton")}</button>
              <button onClick={printForPdf}
                className={`${btn} border border-gray-300 text-gray-600 hover:border-teal-400 bg-white/80`}
                title={t("dashboard.printPdfTooltip")}>{t("dashboard.pdfButton")}</button>
              <button onClick={() => { setShowExportMenu(!showExportMenu); setExportMsg(""); }}
                className={`${btn} border border-gray-300 text-gray-600 hover:border-teal-400 bg-white/80`}
                title={t("dashboard.exportScriptTooltip")}>
                {t("dashboard.exportScriptButton")}
              </button>
              <button onClick={() => setShowShare(!showShare)}
                className={`${btn} border border-gray-300 text-gray-600 hover:border-teal-400 bg-white/80`}>
                {t("dashboard.shareButton")}
              </button>
              <button onClick={startEdit}
                className={`${btn} border border-teal-500 text-teal-600 font-semibold hover:bg-teal-50 bg-white/80`}>
                {t("dashboard.editButton")}
              </button>
            </div>
          </div>

          {/* Panel Export-to-Script — pilih format bundel */}
          {showExportMenu && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
              <h3 className="font-bold text-gray-900 mb-1">{t("dashboard.exportPanelTitle")}</h3>
              <p className="text-xs text-gray-500 mb-3">
                {t("dashboard.exportDescPrefix")} <b>{t("dashboard.exportDescZipWord")}</b> {t("dashboard.exportDescMiddle1")} <b>{t("dashboard.exportDescSampleDataWord")}</b>
                {" "}{t("dashboard.exportDescMiddle2")}
                <b> {t("dashboard.exportDescDevTemplateWord")}</b>{t("dashboard.exportDescSuffix")}
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <button onClick={() => doExport("html")} disabled={exportBusy}
                  className={`${btn} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>
                  {t("dashboard.exportHtmlButton")} <span className="opacity-70 text-xs">{t("dashboard.exportHtmlHint")}</span>
                </button>
                <button onClick={() => doExport("php")} disabled={exportBusy}
                  className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50`}>
                  {t("dashboard.exportPhpButton")} <span className="opacity-70 text-xs">{t("dashboard.exportPhpHint")}</span>
                </button>
                {exportBusy && <span className="text-xs text-gray-500">{t("dashboard.exportPreparingLabel")}</span>}
              </div>

              {/* React & CodeIgniter 3 — masing-masing 2 mode data (hardcode / DB) */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[11px] font-semibold text-gray-500 mb-2">{t("dashboard.exportCodeTemplateLabel")}</p>
                <div className="flex flex-wrap gap-2 items-center">
                  <button onClick={() => doExport("react", "hardcode")} disabled={exportBusy}
                    className={`${btn} bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50`}
                    title={t("dashboard.exportReactHardcodeTooltip")}>
                    {t("dashboard.exportReactHardcodeButton")}
                  </button>
                  <button onClick={() => doExport("react", "db")} disabled={exportBusy}
                    className={`${btn} bg-sky-700 text-white hover:bg-sky-800 disabled:opacity-50`}
                    title={t("dashboard.exportReactDbTooltip")}>
                    {t("dashboard.exportReactDbButton")}
                  </button>
                  <button onClick={() => doExport("ci3", "hardcode")} disabled={exportBusy}
                    className={`${btn} bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50`}
                    title={t("dashboard.exportCi3HardcodeTooltip")}>
                    {t("dashboard.exportCi3HardcodeButton")}
                  </button>
                  <button onClick={() => doExport("ci3", "db")} disabled={exportBusy}
                    className={`${btn} bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-50`}
                    title={t("dashboard.exportCi3DbTooltip")}>
                    {t("dashboard.exportCi3DbButton")}
                  </button>
                  <button onClick={() => doExport("ci4", "hardcode")} disabled={exportBusy}
                    className={`${btn} bg-fuchsia-600 text-white hover:bg-fuchsia-700 disabled:opacity-50`}
                    title={t("dashboard.exportCi4HardcodeTooltip")}>
                    {t("dashboard.exportCi4HardcodeButton")}
                  </button>
                  <button onClick={() => doExport("ci4", "db")} disabled={exportBusy}
                    className={`${btn} bg-fuchsia-700 text-white hover:bg-fuchsia-800 disabled:opacity-50`}
                    title={t("dashboard.exportCi4DbTooltip")}>
                    {t("dashboard.exportCi4DbButton")}
                  </button>
                </div>
              </div>

              {exportMsg && <p className="text-xs text-gray-600 mt-2">{exportMsg}</p>}
            </div>
          )}

          {/* Panel Bagikan / Embed (untuk MANDOR) */}
          {showShare && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
              <h3 className="font-bold text-gray-900 mb-1">{t("dashboard.embedPanelTitle")}</h3>
              <p className="text-xs text-gray-500 mb-3">
                {t("dashboard.embedDescPrefix")}{" "}
                <code className="bg-gray-100 px-1 rounded">f_&lt;kolom&gt;=nilai</code>
                {" "}{t("dashboard.embedDescMiddle")} <code className="bg-gray-100 px-1 rounded">&f_status=completed</code>{t("dashboard.embedDescSuffix")}
              </p>
              {embedUrl ? (
                <div className="flex gap-2 items-center flex-wrap">
                  <input readOnly value={embedUrl}
                    className="flex-1 min-w-[280px] border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50" />
                  <button onClick={copyEmbed} className={`${btn} bg-blue-600 text-white`}>{t("dashboard.copyButton")}</button>
                  <button onClick={regenKey} className={`${btn} border border-red-300 text-red-600`}>
                    {t("dashboard.regenKeyButton")}
                  </button>
                </div>
              ) : (
                <button onClick={regenKey} className={`${btn} bg-blue-600 text-white`}>
                  {t("dashboard.activateEmbedButton")}
                </button>
              )}
              {shareMsg && <p className="text-xs text-gray-600 mt-2">{shareMsg}</p>}
            </div>
          )}

          {(current.filters || []).length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4 bg-white rounded-xl border border-gray-200 shadow-sm p-3">
              {current.filters.map((f) => (
                <div key={f.id} className="text-sm flex items-center gap-2">
                  <span className="font-semibold text-gray-700 capitalize">{f.label}:</span>
                  {renderSlicer(f)}
                </div>
              ))}
            </div>
          )}

          {/* Cross-filter aktif — chip + bersihkan */}
          {crossFilter && (
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-teal-50 border border-teal-300 text-teal-800">
                {t("dashboard.crossFilterLabel")}
                <b className="font-semibold">{crossFilter.column}</b> =
                <b className="font-semibold">{String(crossFilter.value)}</b>
                <button onClick={() => setCrossFilter(null)}
                  className="ml-1 text-teal-600 hover:text-red-600" title={t("dashboard.clearCrossFilterTooltip")}>✕</button>
              </span>
            </div>
          )}

          {(() => {
            const its = current.items || [];
            const gridFor = (list, normalize) => {
              let l = list;
              if (normalize) {
                const minY = Math.min(...list.map((i) => i.y || 0));
                const base = Number.isFinite(minY) ? minY : 0;
                l = list.map((i) => ({ ...i, y: (i.y || 0) - base }));
              }
              return (
                <Grid layout={layoutOf(l)} cols={12} rowHeight={ROW_HEIGHT}
                  isDraggable={false} isResizable={false} compactType={null}>
                  {l.map((it) => (<div key={it.id}>{renderItem(it, false)}</div>))}
                </Grid>
              );
            };
            if (!its.some((it) => it.group)) return gridFor(its, false);
            // #183: kelompokkan jadi section collapsible (urut kemunculan grup).
            const order = []; const map = new Map();
            for (const it of its) {
              const g = it.group || t("dashboard.defaultGroupLabel");
              if (!map.has(g)) { map.set(g, []); order.push(g); }
              map.get(g).push(it);
            }
            return order.map((g) => (
              <DashSection key={g} title={g} count={map.get(g).length}>
                {gridFor(map.get(g), true)}
              </DashSection>
            ));
          })()}

          <p className="text-[11px] text-gray-400 mt-2 no-print">
            {t("dashboard.crossFilterHint")}
          </p>
        </div>
      )}

      {!current && !editing && dashboards.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-4xl mb-2">📊</p>
          <p className="text-gray-600 font-semibold mb-1">{t("dashboard.emptyTitle")}</p>
          <p className="text-gray-400 text-sm">
            {t("dashboard.emptyDescription")}
          </p>
        </div>
      )}
    </div>
  );
}
