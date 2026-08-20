import { useEffect, useState } from "react";
import { storiesApi } from "../api/stories";
import { dashboardsApi } from "../api/dashboards";
import { apiFetch, getUser } from "../api/http";
import ReadOnlyDashboard from "../components/ReadOnlyDashboard";
import ChartPreview from "../components/ChartPreview";
import ShareModal from "../components/ShareModal";
import ConfirmDialog from "../components/ConfirmDialog";
import YearPager from "../components/YearPager";
import { getTheme } from "../charts/themes";
import { yearPage } from "../lib/yearPage";
import { downloadExport } from "../api/exports";
import { useI18n } from "../i18n/I18nContext.jsx";

/**
 * StoryPage v0.11.0 — rangkai dashboard jadi presentasi bertahap.
 *  - Daftar story + buat baru
 *  - Editor: susun langkah (pilih dashboard + judul + narasi), urutkan
 *  - Player: navigasi Sebelumnya/Berikutnya, tiap langkah render 1 dashboard
 *  - Bagikan: kunci embed + URL /story/:id
 */
export default function StoryPage() {
  const { t } = useI18n();
  const [stories, setStories] = useState([]);
  const [dashboards, setDashboards] = useState([]);
  const [current, setCurrent] = useState(null);   // story detail (with dashboards)
  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);            // langkah aktif di player

  const [name, setName] = useState("");
  const [steps, setSteps] = useState([]);
  const [msg, setMsg] = useState("");

  const [showShare, setShowShare] = useState(false);
  const [embedKey, setEmbedKey] = useState(null);
  const [shareMsg, setShareMsg] = useState("");

  // Export-to-Script: panel pilih format + status.
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  function doExport(format) {
    if (!current) return;
    setExportBusy(true); setExportMsg("");
    downloadExport("story", current.id, format)
      .then(() => setExportMsg(t("storyPage.exportSuccessMsg", { format: format.toUpperCase() })))
      .catch((e) => setExportMsg(t("storyPage.failedWithMsg", { msg: e.message })))
      .finally(() => setExportBusy(false));
  }

  // B1: identitas + status modul ACL + item yang sedang dibagikan
  const me = getUser();
  const [aclEnabled, setAclEnabled] = useState(false);
  const [shareItem, setShareItem] = useState(null);
  const [storyYear, setStoryYear] = useState("all");
  const [storyPage, setStoryPage] = useState(1);
  const canShare = (s) => aclEnabled && me &&
    (me.role === "admin" || (s.createdBy && s.createdBy.nip === me.nip));

  useEffect(() => { refresh(); }, []);
  function refresh() {
    storiesApi.list().then((r) => setStories(r.data)).catch(() => {});
    dashboardsApi.list().then((r) => setDashboards(r.data)).catch(() => {});
    apiFetch("/api/auth/me").then((r) => r.json())
      .then((j) => setAclEnabled(!!j.data?.aclEnabled)).catch(() => {});
  }

  async function open(id) {
    const r = await storiesApi.get(id).catch(() => null);
    if (!r) return;
    setCurrent(r.data); setEditing(false); setStep(0);
    setEmbedKey(r.data.embedKey || null); setShowShare(false);
  }

  function startNew() {
    setCurrent(null); setEditing(true); setName(""); setSteps([]); setMsg("");
  }
  function startEdit() {
    setEditing(true); setName(current.name);
    setSteps(current.steps.map(({ dashboard, ...s }) => ({ ...s }))); setMsg("");
  }

  function addStep(dashboardId) {
    setSteps([...steps, { id: `step_${Date.now()}`, dashboardId, title: "", narasi: "" }]);
  }
  function updateStep(i, patch) {
    const next = [...steps]; next[i] = { ...next[i], ...patch }; setSteps(next);
  }
  function move(i, dir) {
    const j = i + dir; if (j < 0 || j >= steps.length) return;
    const next = [...steps]; [next[i], next[j]] = [next[j], next[i]]; setSteps(next);
  }

  async function save() {
    if (!name.trim()) { setMsg(t("storyPage.nameRequiredMsg")); return; }
    if (steps.length === 0) { setMsg(t("storyPage.stepsRequiredMsg")); return; }
    try {
      const payload = { name, steps };
      const r = current ? await storiesApi.update(current.id, payload)
                        : await storiesApi.create(payload);
      setMsg(t("storyPage.savedMsg")); refresh(); open(r.data.id);
    } catch (e) { setMsg(t("storyPage.failedWithMsg", { msg: e.message })); }
  }

  async function removeStory(id) {
    await storiesApi.remove(id).catch(() => {});
    if (current?.id === id) setCurrent(null);
    refresh();
  }

  // Konfirmasi hapus (satuan / massal).
  const [confirmDel, setConfirmDel] = useState(null); // {kind, id?, name?, busy?}
  async function doConfirmDelete() {
    if (!confirmDel) return;
    setConfirmDel({ ...confirmDel, busy: true });
    try {
      if (confirmDel.kind === "all") {
        const r = await storiesApi.removeAll();
        setCurrent(null);
        setMsg(t("storyPage.allDeletedMsg", { count: r.data.deleted }));
      } else {
        await removeStory(confirmDel.id);
      }
      refresh();
    } catch (e) { setMsg(t("storyPage.failedWithMsg", { msg: e.message })); }
    finally { setConfirmDel(null); }
  }

  async function regenKey() {
    try {
      const r = await storiesApi.embedKey(current.id);
      setEmbedKey(r.data.embedKey); setShowShare(true);
      setShareMsg(t("storyPage.embedKeyRegeneratedMsg"));
    } catch (e) { setShareMsg(t("storyPage.failedWithMsg", { msg: e.message })); }
  }
  const embedUrl = embedKey ? `${window.location.origin}/story/${current?.id}?key=${embedKey}` : null;

  const dashName = (id) => dashboards.find((d) => d.id === id)?.name || id;
  const btn = "px-3 py-2 rounded-lg text-sm font-medium transition-colors";

  /** Render chart di player (pakai apiFetch — user login). */
  const renderChart = (it) => (
    <ChartPreview table={it.chart.table}
      suggestion={{ ...it.chart, title: it.chart.name }}
      height="fill" palette={getTheme(current.steps[step].dashboard?.theme).colors} />
  );

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t("storyPage.pageTitle")}</h1>
          <p className="text-gray-500">{t("storyPage.pageSubtitle")}</p>
        </div>
        <button onClick={startNew} className={`${btn} bg-blue-600 text-white font-semibold`}>
          {t("storyPage.newStoryButton")}
        </button>
      </div>

      {/* Daftar story — filter tahun + pagination (#1) */}
      {stories.length > 0 && (() => {
        const v = yearPage(stories, { year: storyYear, page: storyPage, pageSize: 24 });
        return (
          <div className="mb-4">
            <YearPager years={v.years} year={storyYear} setYear={setStoryYear}
              page={storyPage} setPage={setStoryPage} totalPages={v.totalPages} total={v.total} />
            <div className="flex flex-wrap gap-2 items-center">
              {v.pageItems.map((s) => (
                <div key={s.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
                    current?.id === s.id ? "bg-blue-600 text-white border-blue-600" : "bg-white border-gray-300 hover:border-blue-400"
                  }`}>
                  <span className="cursor-pointer" onClick={() => open(s.id)}>{s.name}</span>
                  {canShare(s) && (
                    <span onClick={() => setShareItem(s)} title={t("storyPage.shareAccessTooltip")}
                      className="opacity-60 hover:opacity-100 cursor-pointer">👥</span>
                  )}
                  <span onClick={() => setConfirmDel({ kind: "one", id: s.id, name: s.name })}
                    title={t("storyPage.deleteThisStoryTooltip")} className="opacity-50 hover:opacity-100 cursor-pointer">✕</span>
                </div>
              ))}
              <button onClick={() => setConfirmDel({ kind: "all" })}
                className="ml-1 text-xs px-3 py-1.5 rounded-full border border-red-200 text-red-600 hover:bg-red-50">
                {t("storyPage.deleteAllButton")}
              </button>
            </div>
          </div>
        );
      })()}

      <ConfirmDialog
        open={!!confirmDel}
        title={confirmDel?.kind === "all" ? t("storyPage.confirmDeleteAllTitle") : t("storyPage.confirmDeleteTitle")}
        message={confirmDel?.kind === "all"
          ? t("storyPage.confirmDeleteAllMessage")
          : <>{t("storyPage.confirmDeleteMessagePrefix")} <b>{confirmDel?.name}</b> {t("storyPage.confirmDeleteMessageSuffix")}</>}
        confirmWord={confirmDel?.kind === "all" ? "HAPUS" : null}
        confirmLabel={confirmDel?.kind === "all" ? t("storyPage.deleteAllConfirmLabel") : t("storyPage.deleteConfirmLabel")}
        busy={!!confirmDel?.busy}
        onConfirm={doConfirmDelete}
        onClose={() => setConfirmDel(null)} />

      {shareItem && (
        <ShareModal module="stories" item={shareItem}
          onClose={() => setShareItem(null)} onSaved={() => refresh()} />
      )}

      {/* ===== EDITOR ===== */}
      {editing && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px]"
              value={name} placeholder={t("storyPage.namePlaceholder")}
              onChange={(e) => setName(e.target.value)} />
            <button onClick={save} className={`${btn} bg-blue-600 text-white font-semibold`}>{t("storyPage.saveButton")}</button>
            <button onClick={() => setEditing(false)} className={`${btn} border border-gray-300 text-gray-500`}>{t("common.cancel")}</button>
          </div>
          {msg && <p className="text-sm text-gray-600 mb-2">{msg}</p>}

          {/* Tambah langkah dari dashboard */}
          <div className="flex flex-wrap gap-2 mb-3">
            <span className="text-sm font-semibold text-gray-600 self-center">{t("storyPage.addStepLabel")}</span>
            {dashboards.map((d) => (
              <span key={d.id} onClick={() => addStep(d.id)}
                className="text-xs px-2.5 py-1.5 rounded-full border border-gray-300 cursor-pointer hover:border-blue-500 hover:bg-blue-50">
                + {d.name}
              </span>
            ))}
            {dashboards.length === 0 && <span className="text-xs text-gray-400 self-center">{t("storyPage.noDashboardsText")}</span>}
          </div>

          {/* Daftar langkah */}
          <div className="space-y-2">
            {steps.map((s, i) => (
              <div key={s.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="font-semibold text-sm flex-1">{dashName(s.dashboardId)}</span>
                  <button onClick={() => move(i, -1)} className="text-xs px-1.5">↑</button>
                  <button onClick={() => move(i, 1)} className="text-xs px-1.5">↓</button>
                  <button onClick={() => setSteps(steps.filter((_, x) => x !== i))} className="text-xs text-red-500 px-1.5">✕</button>
                </div>
                <input className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full mb-2"
                  value={s.title} placeholder={t("storyPage.stepTitlePlaceholder")}
                  onChange={(e) => updateStep(i, { title: e.target.value })} />
                <textarea className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full"
                  rows={2} value={s.narasi} placeholder={t("storyPage.stepNarasiPlaceholder")}
                  onChange={(e) => updateStep(i, { narasi: e.target.value })} />
              </div>
            ))}
            {steps.length === 0 && <p className="text-gray-400 text-sm">{t("storyPage.noStepsText")}</p>}
          </div>
        </div>
      )}

      {/* ===== PLAYER ===== */}
      {current && !editing && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-2xl font-bold text-gray-900">{current.name}</h2>
            <div className="flex gap-2">
              <button onClick={() => { setShowExportMenu(!showExportMenu); setExportMsg(""); }}
                className={`${btn} border border-gray-300 text-gray-600`}
                title={t("storyPage.exportScriptTooltip")}>{t("storyPage.exportScriptButton")}</button>
              <button onClick={() => setShowShare(!showShare)} className={`${btn} border border-gray-300 text-gray-600`}>{t("storyPage.shareButton")}</button>
              <button onClick={startEdit} className={`${btn} border border-blue-500 text-blue-600 font-semibold`}>{t("storyPage.editButton")}</button>
            </div>
          </div>

          {/* Panel Export-to-Script */}
          {showExportMenu && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-4">
              <h3 className="font-bold text-gray-900 mb-1">{t("storyPage.exportPanelTitle")}</h3>
              <p className="text-xs text-gray-500 mb-3">
                {t("storyPage.exportDescPrefix")} <b>{t("storyPage.exportDescZipWord")}</b> {t("storyPage.exportDescMiddle")} <b>{t("storyPage.exportDescSampleDataWord")}</b>
                {" "}{t("storyPage.exportDescSuffix")}
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <button onClick={() => doExport("html")} disabled={exportBusy}
                  className={`${btn} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}>
                  {t("storyPage.exportHtmlButton")} <span className="opacity-70 text-xs">{t("storyPage.exportHtmlHint")}</span>
                </button>
                <button onClick={() => doExport("php")} disabled={exportBusy}
                  className={`${btn} bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50`}>
                  {t("storyPage.exportPhpButton")} <span className="opacity-70 text-xs">{t("storyPage.exportPhpHint")}</span>
                </button>
                {exportBusy && <span className="text-xs text-gray-500">{t("storyPage.exportPreparingLabel")}</span>}
              </div>
              {exportMsg && <p className="text-xs text-gray-600 mt-2">{exportMsg}</p>}
            </div>
          )}

          {showShare && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <h3 className="font-bold text-gray-900 mb-1">{t("storyPage.embedPanelTitle")}</h3>
              {embedUrl ? (
                <div className="flex gap-2 items-center flex-wrap">
                  <input readOnly value={embedUrl}
                    className="flex-1 min-w-[280px] border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono bg-gray-50" />
                  <button onClick={() => navigator.clipboard.writeText(embedUrl).then(() => setShareMsg(t("storyPage.copiedMsg")))}
                    className={`${btn} bg-blue-600 text-white`}>{t("storyPage.copyButton")}</button>
                  <button onClick={regenKey} className={`${btn} border border-red-300 text-red-600`}>{t("storyPage.regenKeyButton")}</button>
                </div>
              ) : (
                <button onClick={regenKey} className={`${btn} bg-blue-600 text-white`}>{t("storyPage.activateEmbedButton")}</button>
              )}
              {shareMsg && <p className="text-xs text-gray-600 mt-2">{shareMsg}</p>}
            </div>
          )}

          {/* Navigasi langkah */}
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
              className={`${btn} border border-gray-300 disabled:opacity-40`}>{t("storyPage.prevButton")}</button>
            <div className="flex gap-1">
              {current.steps.map((_, i) => (
                <button key={i} onClick={() => setStep(i)}
                  className={`w-7 h-7 rounded-full text-xs font-bold ${
                    i === step ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
                  }`}>{i + 1}</button>
              ))}
            </div>
            <button onClick={() => setStep(Math.min(current.steps.length - 1, step + 1))}
              disabled={step === current.steps.length - 1}
              className={`${btn} border border-gray-300 disabled:opacity-40`}>{t("storyPage.nextButton")}</button>
            <span className="text-sm text-gray-500 ml-auto">{t("storyPage.stepCounter", { current: step + 1, total: current.steps.length })}</span>
          </div>

          {/* Langkah aktif */}
          {current.steps[step] && (
            <div>
              {current.steps[step].title && (
                <h3 className="text-xl font-bold text-gray-900 mb-1">{current.steps[step].title}</h3>
              )}
              {current.steps[step].narasi && (
                <p className="text-gray-600 mb-3 whitespace-pre-line">{current.steps[step].narasi}</p>
              )}
              {current.steps[step].dashboard ? (
                <ReadOnlyDashboard dashboard={current.steps[step].dashboard} renderChart={renderChart} />
              ) : (
                <p className="text-red-500">{t("storyPage.stepDashboardDeletedText")}</p>
              )}
            </div>
          )}
        </div>
      )}

      {!current && !editing && stories.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-4xl mb-2">🎞️</p>
          <p className="text-gray-600 font-semibold mb-1">{t("storyPage.emptyTitle")}</p>
          <p className="text-gray-400 text-sm">{t("storyPage.emptyDescription")}</p>
        </div>
      )}
    </div>
  );
}
