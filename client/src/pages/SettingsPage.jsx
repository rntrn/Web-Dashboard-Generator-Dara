import { useEffect, useState } from "react";
import { appconfigApi } from "../api/appconfig";
import { applyAppConfig, THEME_PRESETS, FONT_OPTIONS } from "../theme/appTheme";
import { PageHeader, Card, Btn, Spinner, Notice } from "../components/ui";
import { useI18n } from "../i18n/I18nContext.jsx";

const IMG_LIMIT = 300000; // ~220KB base64 (selaras batas server)

/**
 * SettingsPage (admin) — identitas & tema aplikasi DARA (global, v0.36.0).
 * Simpan → backend appconfig → terapkan live (applyAppConfig) + reload global.
 */
export default function SettingsPage({ initialConfig, onSaved }) {
  const { t } = useI18n();
  const [cfg, setCfg] = useState(initialConfig || null);
  const [contrib, setContrib] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!cfg) appconfigApi.get().then((r) => setCfg(r.data)).catch(() => {});
  }, [cfg]);

  if (!cfg) return <div className="p-6"><Spinner label={t("settingsPage.loadingLabel")} /></div>;

  const th = cfg.theme || {};
  const set = (patch) => setCfg({ ...cfg, ...patch });
  const setTheme = (patch) => setCfg({ ...cfg, theme: { ...cfg.theme, ...patch } });

  function pickImage(field, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      if (url.length > IMG_LIMIT) { setErr(t("settingsPage.imageTooLargeMsg")); return; }
      set({ [field]: url }); setErr("");
    };
    reader.readAsDataURL(file);
  }
  function addContrib() {
    const v = contrib.trim(); if (!v) return;
    set({ contributors: [...(cfg.contributors || []), v].slice(0, 30) }); setContrib("");
  }

  async function save() {
    setSaving(true); setMsg(""); setErr("");
    try {
      const r = await appconfigApi.update({
        appName: cfg.appName, tagline: cfg.tagline, logo: cfg.logo,
        logoImage: cfg.logoImage || "", faviconImage: cfg.faviconImage || "", companyImage: cfg.companyImage || "",
        company: cfg.company, companyIcon: cfg.companyIcon,
        contributors: cfg.contributors, theme: cfg.theme,
      });
      setCfg(r.data); applyAppConfig(r.data); if (onSaved) onSaved();
      setMsg(t("settingsPage.savedAppliedMsg"));
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  const label = "block text-sm font-semibold text-gray-700 mb-1";
  const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400";

  const ImageField = ({ title, field, hint }) => (
    <div>
      <span className={label}>{title}</span>
      <div className="flex items-center gap-3">
        {cfg[field]
          ? <img src={cfg[field]} alt="" className="h-10 w-10 object-contain rounded-lg border border-gray-200" />
          : <span className="text-xs text-gray-400">{t("settingsPage.noImageLabel")}</span>}
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(e) => pickImage(field, e.target.files && e.target.files[0])} className="text-xs" />
        {cfg[field] && <button onClick={() => set({ [field]: "" })} className="text-xs text-red-500">{t("settingsPage.removeImageButton")}</button>}
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto p-6">
      <PageHeader title={t("settingsPage.pageTitle")} subtitle={t("settingsPage.pageSubtitle")} />

      {msg && <div className="mb-3"><Notice kind="success">{msg}</Notice></div>}
      {err && <div className="mb-3"><Notice kind="error">{err}</Notice></div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Identitas */}
        <Card className="p-5 space-y-4">
          <h3 className="font-bold text-gray-900">{t("settingsPage.identityHeading")}</h3>
          <div><span className={label}>{t("settingsPage.appNameLabel")}</span>
            <input className={inp} value={cfg.appName || ""} onChange={(e) => set({ appName: e.target.value })} placeholder="DARA" /></div>
          <div><span className={label}>{t("settingsPage.taglineLabel")}</span>
            <input className={inp} value={cfg.tagline || ""} onChange={(e) => set({ tagline: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><span className={label}>{t("settingsPage.companyLabel")}</span>
              <input className={inp} value={cfg.company || ""} onChange={(e) => set({ company: e.target.value })} placeholder={t("settingsPage.companyPlaceholder")} /></div>
            <div><span className={label}>{t("settingsPage.companyIconLabel")}</span>
              <input className={inp} value={cfg.companyIcon || ""} onChange={(e) => set({ companyIcon: e.target.value })} maxLength={8} placeholder="🏢" /></div>
          </div>
          <ImageField title={t("settingsPage.logoImageTitle")} field="logoImage" hint={t("settingsPage.logoImageHint")} />
          <ImageField title={t("settingsPage.faviconTitle")} field="faviconImage" hint={t("settingsPage.faviconHint")} />
          <ImageField title={t("settingsPage.companyImageTitle")} field="companyImage" hint={t("settingsPage.companyImageHint")} />
          <div>
            <span className={label}>{t("settingsPage.contributorsLabel")}</span>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(cfg.contributors || []).map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs bg-gray-100 border border-gray-200 rounded-full px-2.5 py-1">
                  {c}<button onClick={() => set({ contributors: cfg.contributors.filter((_, x) => x !== i) })} className="text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={inp} value={contrib} onChange={(e) => setContrib(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addContrib())} placeholder={t("settingsPage.contributorNamePlaceholder")} />
              <Btn variant="solid" onClick={addContrib}>{t("settingsPage.addButton")}</Btn>
            </div>
          </div>
        </Card>

        {/* Tema */}
        <Card className="p-5 space-y-4">
          <h3 className="font-bold text-gray-900">{t("settingsPage.themeHeading")}</h3>
          <div>
            <span className={label}>{t("settingsPage.themePresetLabel")}</span>
            <div className="flex flex-wrap gap-2">
              {THEME_PRESETS.map((p) => (
                <button key={p.id} title={p.name} onClick={() => setTheme({ accent: p.accent, accent2: p.accent2, bg: p.bg })}
                  className={`w-9 h-9 rounded-lg border-2 ${th.accent === p.accent ? "border-gray-900 scale-110" : "border-gray-200"}`}
                  style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})` }} />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ColorField label={t("settingsPage.accentColorLabel")} value={th.accent} onChange={(v) => setTheme({ accent: v })} def="#14b8a6" />
            <ColorField label={t("settingsPage.accent2ColorLabel")} value={th.accent2} onChange={(v) => setTheme({ accent2: v })} def="#0ea5e9" />
            <ColorField label={t("settingsPage.bgColorLabel")} value={th.bg} onChange={(v) => setTheme({ bg: v })} def="#f1f5f9" />
            <div><span className={label}>{t("settingsPage.fontLabel")}</span>
              <select className={inp} value={th.font || "system"} onChange={(e) => setTheme({ font: e.target.value })}>
                {FONT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select></div>
          </div>
          <div className="rounded-xl p-4 text-white text-sm font-semibold"
            style={{ background: `linear-gradient(90deg, ${th.accent || "#14b8a6"}, ${th.accent2 || "#0ea5e9"})` }}>
            {t("settingsPage.themePreviewText")}
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <Btn variant="primary" onClick={save} disabled={saving}>{saving ? t("settingsPage.savingLabel") : t("settingsPage.saveApplyButton")}</Btn>
      </div>
    </div>
  );
}

function ColorField({ label, value, onChange, def }) {
  return (
    <div>
      <span className="block text-sm font-semibold text-gray-700 mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value || def} onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 rounded border border-gray-300 cursor-pointer" />
        <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={def}
          className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm" />
      </div>
    </div>
  );
}
