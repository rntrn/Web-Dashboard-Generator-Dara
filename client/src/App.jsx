import { useEffect, useState } from "react";
import ConnectionsPage from "./pages/ConnectionsPage";
import DataPreparationPage from "./pages/DataPreparationPage";
import SelectDataSource from "./pages/SelectDataSource";
import ChartBuilder from "./pages/ChartBuilder";
import DashboardPage from "./pages/DashboardPage";
import MapPage from "./pages/MapPage";
import StoryPage from "./pages/StoryPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import GlobalUI from "./components/GlobalUI";
import Logo from "./components/Logo";
import { getUser, clearSession, apiFetch } from "./api/http";
import { appconfigApi } from "./api/appconfig";
import { applyAppConfig } from "./theme/appTheme";
import { ui } from "./lib/uiBus";
import { useI18n } from "./i18n/I18nContext";
import LangToggle from "./components/LangToggle";

/**
 * DARA v0.16.0 — identitas visual baru (bukan gaya generik AI):
 * sidebar midnight, aksen teal→sky→indigo, logo bar-chart. Sidebar collapse,
 * loading bar global, dev-mode error popup (toggle admin).
 * v0.35.0: label/desc nav diambil dari i18n (tKey/descKey).
 * v0.40.0: tambah "connections" (Data Connection) sebagai LANGKAH PALING
 * AWAL — admin-only (kredensial database eksternal), jadi difilter per role
 * SEBELUM diberi nomor urut (lihat coreNav di bawah), supaya user biasa
 * tetap melihat penomoran 1..N yang rapi untuk langkah yang bisa mereka akses.
 */
const NAV = [
  { id: "connections", icon: "🔌", tKey: "nav.connections", descKey: "nav.connections_desc", adminOnly: true },
  { id: "dataprep", icon: "🧪", tKey: "nav.dataprep", descKey: "nav.dataprep_desc", adminOnly: true },
  { id: "explore",   icon: "🔍", tKey: "nav.explore",   descKey: "nav.explore_desc" },
  { id: "builder",   icon: "🧩", tKey: "nav.builder",   descKey: "nav.builder_desc" },
  { id: "map",       icon: "🗺️", tKey: "nav.map",       descKey: "nav.map_desc" },
  { id: "dashboard", icon: "🗂️", tKey: "nav.dashboard", descKey: "nav.dashboard_desc" },
  { id: "story",     icon: "🎬", tKey: "nav.story",      descKey: "nav.story_desc" },
];

export default function App() {
  const { t } = useI18n();
  const [user, setUser] = useState(getUser());
  const [view, setView] = useState("explore");
  const [collapsed, setCollapsed] = useState(false);
  const [fade, setFade] = useState(false);
  const [appcfg, setAppcfg] = useState(null); // identitas/tema global (v0.36.0)

  // Ambil status devMode global (di-toggle admin) tiap kali user berubah/login.
  useEffect(() => {
    if (!user) return;
    apiFetch("/api/auth/me", { _skipLoading: true })
      .then((r) => r.json())
      .then((r) => ui.setDevMode(!!r.data?.devMode))
      .catch(() => {});
  }, [user]);

  // Muat & terapkan identitas/tema (publik, sekali saat boot).
  function loadAppConfig() {
    appconfigApi.get()
      .then((r) => { setAppcfg(r.data); applyAppConfig(r.data); })
      .catch(() => {});
  }
  useEffect(() => { loadAppConfig(); }, []);
  const appName = appcfg?.appName || "DARA";
  const appTagline = appcfg?.tagline || "Dashboard & Reporting Generator";
  const appLogo = appcfg?.logoImage || "";

  // Efek transisi halus antar halaman.
  function goto(v) {
    if (v === view) return;
    setFade(true);
    setTimeout(() => { setView(v); setFade(false); }, 120);
  }

  if (!user) return (<>
    <GlobalUI />
    <LoginPage onLogin={setUser} appcfg={appcfg} />
  </>);

  function logout() { clearSession(); ui.setDevMode(false); setUser(null); }
  const isAdmin = user.role === "admin";
  // Item admin-only (mis. "connections") disaring SEBELUM diberi nomor urut,
  // supaya penomoran 1..N tetap rapi untuk siapa pun yang login (lihat NAV).
  const coreNav = NAV.filter((n) => !n.adminOnly || isAdmin);
  const nav = [...coreNav, ...(isAdmin ? [
    { id: "users", icon: "👤", tKey: "nav.users", descKey: "nav.users_desc" },
    { id: "settings", icon: "⚙️", tKey: "nav.settings", descKey: "nav.settings_desc" },
  ] : [])];

  return (
    <div className="min-h-screen flex dara-app-bg">
      <GlobalUI />

      {/* Sidebar — midnight dengan aksen teal */}
      <aside className={`${collapsed ? "w-16" : "w-60"} shrink-0 flex flex-col text-slate-200 transition-all duration-200 relative`}
        style={{ background: "linear-gradient(180deg,#0b1120 0%,#0e1a2b 100%)" }}>
        <button onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Perlebar" : "Ciutkan"}
          className="absolute -right-3 top-6 z-20 w-6 h-6 rounded-full bg-white text-slate-700 shadow-md border border-slate-200 flex items-center justify-center text-xs hover:bg-teal-50">
          {collapsed ? "›" : "‹"}
        </button>

        <div className={`${collapsed ? "px-0 flex justify-center" : "px-5"} py-6`}>
          {collapsed
            ? <Logo size={30} image={appLogo} />
            : <Logo size={34} withText textClass="text-white" name={appName} tagline={appTagline} image={appLogo} />}
        </div>

        <nav className="flex-1 px-2 space-y-1">
          {nav.map((n, i) => (
            <button key={n.id} onClick={() => goto(n.id)} title={t(n.tKey)}
              style={view === n.id ? { background: "rgba(255,255,255,0.06)", borderLeft: `2px solid var(--dara-accent)` } : { borderLeft: "2px solid transparent" }}
              className={`w-full rounded-r-lg transition-all group ${collapsed ? "p-0 h-11 flex items-center justify-center" : "text-left pl-3 pr-3 py-2.5"} ${
                view === n.id ? "text-white" : "hover:bg-white/5"
              }`}>
              {collapsed ? (
                <span className="text-lg">{n.icon}</span>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-lg">{n.icon}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold flex items-center gap-2">
                      {i < coreNav.length && (
                        <span className={`text-[10px] w-4 h-4 rounded-full flex items-center justify-center ${
                          view === n.id ? "text-white" : "bg-white/10 text-slate-400"
                        }`} style={view === n.id ? { background: "var(--dara-accent)" } : undefined}>{i + 1}</span>
                      )}
                      {t(n.tKey)}
                    </div>
                    <div className={`text-[11px] truncate ${view === n.id ? "text-slate-300" : "text-slate-500 group-hover:text-slate-400"}`}>
                      {t(n.descKey)}
                    </div>
                  </div>
                </div>
              )}
            </button>
          ))}
        </nav>

        <div className={`${collapsed ? "px-2" : "px-4"} py-4 border-t border-white/10`}>
          {collapsed ? (
            <button onClick={logout} title={t("action.logout")}
              className="w-full h-9 rounded-lg border border-white/10 text-slate-400 hover:text-white flex items-center justify-center">⎋</button>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: "var(--dara-accent)" }}>
                    {(user.nama || user.nip || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate text-white">{user.nama || user.nip}</div>
                    <div className="text-[10px] text-slate-500">{user.role === "admin" ? t("role.admin") : t("role.user")} · {user.nip}</div>
                  </div>
                </div>
                <LangToggle dark />
              </div>
              <button onClick={logout}
                className="w-full text-xs py-1.5 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/30">{t("action.logout")}</button>
            </>
          )}
        </div>
      </aside>

      {/* Konten — animasi masuk halus tiap ganti halaman (key={view}) */}
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <div key={view}
          className={`dara-fade-in transition-opacity duration-150 ${fade ? "opacity-0" : "opacity-100"}`}>
          {view === "connections" && isAdmin && <ConnectionsPage />}
          {view === "dataprep" && isAdmin && <DataPreparationPage />}
          {view === "explore" && <SelectDataSource />}
          {view === "builder" && <ChartBuilder />}
          {view === "dashboard" && <DashboardPage />}
          {view === "map" && <MapPage />}
          {view === "story" && <StoryPage />}
          {view === "users" && isAdmin && <UsersPage />}
          {view === "settings" && isAdmin && <SettingsPage initialConfig={appcfg} onSaved={loadAppConfig} />}
        </div>
      </main>
    </div>
  );
}
