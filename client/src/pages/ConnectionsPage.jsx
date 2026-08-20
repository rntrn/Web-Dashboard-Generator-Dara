import { useEffect, useState } from "react";
import { connectionsApi } from "../api/connections";
import { PageHeader, Card, Btn, Badge, Notice, Spinner, EmptyState } from "../components/ui";
import ConfirmDialog from "../components/ConfirmDialog";
import PromptDialog from "../components/PromptDialog";
import ProgressDialog from "../components/ProgressDialog";
import { ui } from "../lib/uiBus";
import { useI18n } from "../i18n/I18nContext";

/**
 * ConnectionsPage (khusus admin) — menu "Data Connection".
 * Kelola koneksi ke database eksternal SEBELUM alur Jelajah Data/Chart
 * Builder. Lihat docs/08-data-connection.md untuk arsitektur lengkap.
 *
 * v0.41.0 — form field DINAMIS mengikuti skema `driver.fields` dari server
 * (drivers/registry.js), bukan lagi form host/port/user/password TETAP.
 * Tiap driver bisa punya bentuk kredensial beda total (mis. Snowflake pakai
 * account+warehouse, DynamoDB pakai access key AWS, Firestore pakai service
 * account JSON) — lihat FieldInput di bawah. Field bertanda `secret` di
 * server TIDAK PERNAH dikirim balik; form edit menampilkan hint "sudah
 * terisi, kosongkan = tidak berubah" lewat `secretFieldsPresent`.
 */

const TIER_LABEL = {
  sql: { id: "SQL relasional", en: "Relational SQL" },
  document: { id: "Dokumen / wide-column", en: "Document / wide-column" },
  graph: { id: "Graf", en: "Graph" },
  kv: { id: "Key-value", en: "Key-value" },
  vector: { id: "Vector (terbatas)", en: "Vector (limited)" },
};
const TIER_ORDER = ["sql", "document", "graph", "kv", "vector"];

const STATUS_BADGE = {
  AKTIF: { color: "green", key: "connectionsPage.statusActive" },
  GAGAL: { color: "red", key: "connectionsPage.statusFailed" },
  BELUM_DITES: { color: "gray", key: "connectionsPage.statusUntested" },
};

function emptyForm() {
  return { nama: "", driver: "", config: {} };
}

/** Satu input form, tipenya mengikuti field.type dari server. */
function FieldInput({ field, value, onChange, secretPresent, lang }) {
  const label = lang === "en" ? field.en : field.id;
  const base = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    );
  }
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">
        {label}{field.required && <span className="text-red-500"> *</span>}
        {field.secret && secretPresent && <span className="text-gray-400 font-normal"> ({lang === "en" ? "already set — leave blank to keep" : "sudah terisi — kosongkan agar tidak berubah"})</span>}
      </label>
      {field.type === "textarea" ? (
        <textarea className={`${base} font-mono text-xs`} rows={4}
          value={value || ""} onChange={(e) => onChange(e.target.value)}
          placeholder={field.secret && secretPresent ? "••••••••" : field.placeholder || ""} />
      ) : (
        <input type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
          className={base} value={value ?? ""} onChange={(e) => onChange(e.target.value)}
          placeholder={field.secret && secretPresent ? "••••••••" : field.placeholder || ""} />
      )}
    </div>
  );
}

export default function ConnectionsPage() {
  const { t, lang } = useI18n();
  const [conns, setConns] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // id koneksi yang diedit, null = buat baru
  const [editingSecretFields, setEditingSecretFields] = useState([]); // secretFieldsPresent milik koneksi yang diedit
  const [form, setForm] = useState(emptyForm());
  const [formErr, setFormErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null); // { id, nama }

  // Fase 1 — jelajahi tabel koneksi & impor jadi tabel dara_data_conn_*.
  const [tablesFor, setTablesFor] = useState(null); // id koneksi yang tabelnya sedang dibuka
  const [connTables, setConnTables] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [tablesErr, setTablesErr] = useState("");
  const [importPrompt, setImportPrompt] = useState(null); // { connId, table } | null
  // Progres IMPOR — SIMULASI (lihat catatan di ProgressDialog.jsx): satu
  // request server yang selesai sekaligus, bukan bertahap seperti unggah file.
  const [importProgress, setImportProgress] = useState({ open: false, phase: "running", errorText: "", successText: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [cr, dr] = await Promise.all([connectionsApi.list(), connectionsApi.listDrivers()]);
      setConns(cr.data || []);
      setDrivers(dr.data || []);
    } catch (e) {
      ui.reportError(t("connectionsPage.loadErrorMsg"), e);
    } finally {
      setLoading(false);
    }
  }

  const selectedDriverDef = drivers.find((d) => d.key === form.driver) || null;

  function openCreate() {
    setEditing(null);
    setEditingSecretFields([]);
    setForm(emptyForm());
    setFormErr("");
    setShowForm(true);
  }

  function openEdit(c) {
    setEditing(c.id);
    setEditingSecretFields(c.secretFieldsPresent || []);
    setForm({ nama: c.nama || "", driver: c.driver, config: { ...c.config } });
    setFormErr("");
    setShowForm(true);
  }

  function pickDriver(key) {
    setForm({ nama: form.nama, driver: key, config: {} });
  }

  function setFieldValue(key, value) {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  }

  async function submitForm(e) {
    e.preventDefault();
    setFormErr("");
    if (!form.driver) return setFormErr(t("connectionsPage.errPickDriver"));
    const def = drivers.find((d) => d.key === form.driver);
    for (const f of def?.fields || []) {
      const val = form.config[f.key];
      const isNewSecret = f.secret && !(editing && editingSecretFields.includes(f.key));
      if (f.required && (f.secret ? isNewSecret : true) && !String(val || "").trim()) {
        return setFormErr(`${lang === "en" ? "Field" : "Field"} "${lang === "en" ? f.en : f.id}" ${lang === "en" ? "is required." : "wajib diisi."}`);
      }
    }
    setSaving(true);
    try {
      if (editing) {
        await connectionsApi.update(editing, form);
        ui.toast(t("connectionsPage.updatedToast"), { kind: "success" });
      } else {
        await connectionsApi.create(form);
        ui.toast(t("connectionsPage.createdToast"), { kind: "success" });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setFormErr(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testConn(id) {
    setTestingId(id);
    try {
      const r = await connectionsApi.test(id);
      if (r.data?.ok) ui.toast(t("connectionsPage.testOkToast"), { kind: "success" });
      else ui.reportError(t("connectionsPage.testFailToast", { msg: r.data?.error || "" }), null);
    } catch (e) {
      ui.reportError(t("connectionsPage.testErrorMsg"), e);
    } finally {
      setTestingId(null);
      load();
    }
  }

  /** Buka/tutup panel daftar tabel sebuah koneksi (Fase 1 — sebelum impor). */
  async function toggleTables(c) {
    if (tablesFor === c.id) { setTablesFor(null); return; }
    setTablesFor(c.id);
    setConnTables([]);
    setTablesErr("");
    setLoadingTables(true);
    try {
      const r = await connectionsApi.listTables(c.id);
      setConnTables(r.data || []);
    } catch (e) {
      setTablesErr(e.message);
    } finally {
      setLoadingTables(false);
    }
  }

  /** Jalankan import setelah nama tabel hasil dikonfirmasi lewat PromptDialog. */
  async function doImport(name) {
    const { connId, table } = importPrompt;
    setImportPrompt(null);
    setImportProgress({ open: true, phase: "running", errorText: "", successText: "" });
    try {
      const r = await connectionsApi.import(connId, { table, name });
      setImportProgress({
        open: true, phase: "done", errorText: "",
        successText: t("connectionsPage.importSuccessMsg", { name: r.data.name, rows: r.data.rowCount }),
      });
    } catch (e) {
      setImportProgress({ open: true, phase: "error", errorText: e.message, successText: "" });
    }
  }

  async function doDelete() {
    if (!confirmDel) return;
    try {
      await connectionsApi.remove(confirmDel.id);
      ui.toast(t("connectionsPage.deletedToast"), { kind: "success" });
      setConfirmDel(null);
      load();
    } catch (e) {
      ui.reportError(t("connectionsPage.deleteErrorMsg"), e);
    }
  }

  const grouped = TIER_ORDER.map((tier) => ({ tier, items: drivers.filter((d) => d.tier === tier) })).filter((g) => g.items.length);

  function summarizeConfig(c) {
    const cfg = c.config || {};
    return cfg.host ? `${cfg.host}${cfg.port ? `:${cfg.port}` : ""}${cfg.database ? ` · ${cfg.database}` : ""}`
      : cfg.account ? `${cfg.account}${cfg.warehouse ? ` · ${cfg.warehouse}` : ""}`
      : cfg.region ? `${cfg.region}`
      : cfg.projectId ? cfg.projectId
      : cfg.indexName ? cfg.indexName
      : cfg.address ? cfg.address
      : cfg.filePath ? cfg.filePath
      : "";
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <PageHeader
        title={t("connectionsPage.pageTitle")}
        subtitle={t("connectionsPage.pageSubtitle")}
        right={<Btn variant="primary" onClick={openCreate}>+ {t("connectionsPage.addButton")}</Btn>}
      />

      {loading ? (
        <Spinner label={t("connectionsPage.loadingLabel")} />
      ) : conns.length === 0 ? (
        <EmptyState icon="🔌" title={t("connectionsPage.emptyTitle")} hint={t("connectionsPage.emptyHint")} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {conns.map((c) => {
            const def = drivers.find((d) => d.key === c.driver);
            const badge = STATUS_BADGE[c.status] || STATUS_BADGE.BELUM_DITES;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.nama}</p>
                    <p className="text-xs text-gray-500">
                      {def?.label || c.driver}
                      {def && !def.installed && <span className="text-amber-500"> · {lang === "en" ? "needs install" : "perlu instal"}</span>}
                    </p>
                  </div>
                  <Badge color={badge.color}>{t(badge.key)}</Badge>
                </div>
                <p className="text-xs text-gray-400 mb-3 truncate">{summarizeConfig(c)}</p>
                {c.lastError && c.status === "GAGAL" && (
                  <p className="text-[11px] text-red-500 mb-3 truncate" title={c.lastError}>{c.lastError}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Btn variant="ghost" className="!px-2.5 !py-1 text-xs" disabled={testingId === c.id} onClick={() => testConn(c.id)}>
                    {testingId === c.id ? t("connectionsPage.testingLabel") : t("connectionsPage.testButton")}
                  </Btn>
                  <Btn variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => toggleTables(c)}>
                    {tablesFor === c.id ? t("connectionsPage.hideTablesButton") : t("connectionsPage.showTablesButton")}
                  </Btn>
                  <Btn variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => openEdit(c)}>{t("connectionsPage.editButton")}</Btn>
                  <Btn variant="danger" className="!px-2.5 !py-1 text-xs" onClick={() => setConfirmDel({ id: c.id, nama: c.nama })}>
                    {t("connectionsPage.deleteButton")}
                  </Btn>
                </div>

                {/* Fase 1 — daftar tabel/koleksi di sisi koneksi + tombol Impor per tabel. */}
                {tablesFor === c.id && (
                  <div className="mt-2.5 pt-2.5 border-t border-gray-100">
                    {loadingTables ? (
                      <p className="text-xs text-gray-400">{t("connectionsPage.loadingTablesLabel")}</p>
                    ) : tablesErr ? (
                      <p className="text-xs text-red-500">{tablesErr}</p>
                    ) : connTables.length === 0 ? (
                      <p className="text-xs text-gray-400">{t("connectionsPage.noTablesFound")}</p>
                    ) : (
                      <div className="space-y-1 max-h-40 overflow-auto">
                        {connTables.map((tb) => (
                          <div key={tb.name} className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-mono truncate text-gray-700" title={tb.name}>{tb.name}</span>
                            <button
                              onClick={() => setImportPrompt({ connId: c.id, table: tb.name })}
                              className="shrink-0 text-teal-600 hover:text-teal-800 hover:underline font-semibold">
                              {t("connectionsPage.importButton")}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {showForm && (
        // Overlay SENDIRI yang scroll (bukan cuma form-nya) - kalau cuma form yang
        // overflow-y-auto sementara overlay `items-center` tidak bisa di-scroll,
        // konten yang lebih tinggi dari viewport (mis. driver dengan banyak field)
        // bagian ATASNYA (judul, pesan error) bisa terdorong ke luar layar TANPA
        // ada cara untuk scroll ke sana - persis keluhan "kotak inputan kurang
        // turun". Pola di bawah (overlay overflow-y-auto + wrapper min-h-full)
        // menjamin seluruh isi form, termasuk banner error di submitForm(),
        // selalu bisa dijangkau dengan scroll normal.
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4" onClick={() => !saving && setShowForm(false)}>
          <div className="min-h-full flex items-start sm:items-center justify-center">
            <form onSubmit={submitForm} onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 my-8">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {editing ? t("connectionsPage.editTitle") : t("connectionsPage.createTitle")}
              </h3>

            {formErr && <div className="mb-3"><Notice kind="error">{formErr}</Notice></div>}
            {selectedDriverDef && !selectedDriverDef.installed && (
              <div className="mb-3">
                <Notice kind="warning">
                  {lang === "en"
                    ? `This driver needs a manual package install: npm install ${(selectedDriverDef.npmPackages || []).join(" ")} in the server/ folder (or npm run driver:install -- ${selectedDriverDef.key}).`
                    : `Driver ini perlu instal paket manual: npm install ${(selectedDriverDef.npmPackages || []).join(" ")} di folder server/ (atau npm run driver:install -- ${selectedDriverDef.key}).`}
                  {selectedDriverDef.note ? ` — ${selectedDriverDef.note}` : ""}
                </Notice>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t("connectionsPage.nameLabel")}</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={form.nama} onChange={(e) => setForm((f) => ({ ...f, nama: e.target.value }))}
                  placeholder={t("connectionsPage.namePlaceholder")} />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{t("connectionsPage.driverLabel")}</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
                  value={form.driver} onChange={(e) => pickDriver(e.target.value)} disabled={!!editing}>
                  <option value="">{t("connectionsPage.driverPlaceholder")}</option>
                  {grouped.map((g) => (
                    <optgroup key={g.tier} label={lang === "en" ? TIER_LABEL[g.tier].en : TIER_LABEL[g.tier].id}>
                      {g.items.map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.label}{!d.installed ? ` (${lang === "en" ? "needs install" : "perlu instal"})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {selectedDriverDef?.fields.map((f) => (
                <FieldInput key={f.key} field={f} value={form.config[f.key]}
                  onChange={(v) => setFieldValue(f.key, v)}
                  secretPresent={editingSecretFields.includes(f.key)} lang={lang} />
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <Btn variant="ghost" type="button" disabled={saving} onClick={() => setShowForm(false)}>{t("common.cancel")}</Btn>
              <Btn variant="primary" type="submit" disabled={saving}>{saving ? t("common.processing") : t("common.create")}</Btn>
            </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title={t("connectionsPage.confirmDeleteTitle")}
        message={t("connectionsPage.confirmDeleteMsg", { nama: confirmDel?.nama || "" })}
        confirmLabel={t("connectionsPage.deleteButton")}
        onConfirm={doDelete}
        onClose={() => setConfirmDel(null)}
      />

      {/* Fase 1 — minta nama tabel hasil SEBELUM impor dijalankan. */}
      <PromptDialog
        open={!!importPrompt}
        title={t("connectionsPage.importPromptTitle")}
        message={importPrompt && <>{t("connectionsPage.importPromptMsgPrefix")} <b>{importPrompt.table}</b></>}
        label={t("connectionsPage.importNameLabel")}
        defaultValue={importPrompt?.table || ""}
        confirmLabel={t("connectionsPage.importConfirmLabel")}
        onConfirm={doImport}
        onClose={() => setImportPrompt(null)}
      />

      {/* Fase 1 — progres IMPOR, persen SIMULASI (lihat catatan di ProgressDialog.jsx). */}
      <ProgressDialog
        open={importProgress.open}
        title={t("connectionsPage.importProgressTitle")}
        phase={importProgress.phase}
        simulate
        statusText={t("connectionsPage.importProgressStatus")}
        successText={importProgress.successText}
        errorText={importProgress.errorText}
        onClose={() => setImportProgress((p) => ({ ...p, open: false }))}
      />
    </div>
  );
}
