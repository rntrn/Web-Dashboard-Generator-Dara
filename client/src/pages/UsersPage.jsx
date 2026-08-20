import { useEffect, useState } from "react";
import { apiFetch } from "../api/http";
import { ui } from "../lib/uiBus";
import { useI18n } from "../i18n/I18nContext.jsx";

/**
 * UsersPage (khusus admin) — DARA Free:
 *  - Daftarkan pengguna (NIP maks 30 karakter + email) yang boleh login.
 *    Kalau NIP sudah ada sebagai data pegawai (HR), pegawai itu otomatis
 *    "dipromosikan" jadi pengguna aplikasi — data HR-nya tidak berubah.
 *  - Login bisa pakai EMAIL atau NIP, salah satu.
 *  - Setel password awal; pengguna tanpa password belum bisa masuk.
 *  - Reset password pengguna yang sudah ada ke bawaan "user123" (mis. lupa
 *    password, atau akun contoh seperti Jane Doe yang belum pernah disetel).
 *  - Tunjuk role admin/user.
 *  - Ganti password akun admin lokal (akun terpisah, bukan dari tabel pegawai).
 */
export default function UsersPage() {
  const { t, lang } = useI18n();
  const [users, setUsers] = useState([]);
  const [nip, setNip] = useState("");
  const [nama, setNama] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState("");

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [devMode, setDevMode] = useState(false);
  const [aclOn, setAclOn] = useState(false);
  const [uploadOn, setUploadOn] = useState(false);
  const [activity, setActivity] = useState([]);

  useEffect(() => { load(); }, []);

  function load() {
    apiFetch("/api/users").then((r) => r.json())
      .then((r) => setUsers(r.data || []))
      .catch(() => {});
    apiFetch("/api/users/devmode").then((r) => r.json())
      .then((r) => setDevMode(!!r.data?.devMode))
      .catch(() => {});
    apiFetch("/api/users/acl").then((r) => r.json())
      .then((r) => setAclOn(!!r.data?.enabled))
      .catch(() => {});
    apiFetch("/api/users/activity?limit=200").then((r) => r.json())
      .then((r) => setActivity(r.data || []))
      .catch(() => {});
    apiFetch("/api/users/upload").then((r) => r.json())
      .then((r) => setUploadOn(!!r.data?.enabled))
      .catch(() => {});
  }

  async function toggleUpload() {
    try {
      const r = await apiFetch("/api/users/upload", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: !uploadOn }),
      });
      const j = await r.json();
      setUploadOn(!!j.data?.enabled);
      ui.toast(j.data?.enabled ? t("usersPage.uploadOnToast") : t("usersPage.uploadOffToast"), { kind: "success" });
    } catch (e) { ui.reportError(t("usersPage.uploadToggleErrorMsg"), e); }
  }

  async function toggleAcl() {
    try {
      const r = await apiFetch("/api/users/acl", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: !aclOn }),
      });
      const j = await r.json();
      setAclOn(!!j.data?.enabled);
      ui.toast(j.data?.enabled ? t("usersPage.aclOnToast") : t("usersPage.aclOffToast"),
        { kind: "success" });
    } catch (e) { ui.reportError(t("usersPage.aclToggleErrorMsg"), e); }
  }

  async function toggleDevMode() {
    try {
      const r = await apiFetch("/api/users/devmode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: !devMode }),
      });
      const json = await r.json();
      setDevMode(!!json.data?.devMode);
      ui.setDevMode(!!json.data?.devMode);
      ui.toast(json.data?.devMode ? t("usersPage.devModeOnToast") : t("usersPage.devModeOffToast"),
        { kind: "success" });
    } catch (e) { ui.reportError(t("usersPage.devModeToggleErrorMsg"), e); }
  }

  async function addUser(e) {
    e.preventDefault();
    setMsg("");
    try {
      const r = await apiFetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nip: nip.trim(),
          nama: nama.trim(),
          email: email.trim(),
          // Password opsional. Bila dikosongkan, pengguna terdaftar tapi
          // belum bisa login sampai admin menyetel passwordnya.
          password: pass.trim() || undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setNip(""); setNama(""); setEmail(""); setPass("");
      setMsg(pass.trim() ? t("usersPage.userRegisteredCanLoginMsg")
                         : t("usersPage.userRegisteredNeedPasswordMsg"));
      load();
    } catch (err) { setMsg(t("usersPage.failedWithMsg", { msg: err.message })); }
  }

  async function toggleRole(u) {
    await apiFetch(`/api/users/${u.nip}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: u.role === "admin" ? "user" : "admin" }),
    }).catch(() => {});
    load();
  }

  async function removeUser(nipDel) {
    if (!confirm(t("usersPage.confirmRemoveUser", { nip: nipDel }))) return;
    await apiFetch(`/api/users/${nipDel}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  // Reset cepat ke password bawaan "user123" — dipakai admin saat pengguna
  // lupa password atau akun contoh belum pernah disetel (mis. Jane Doe).
  // Pengguna WAJIB diminta segera menggantinya sendiri setelah login;
  // DARA Free belum punya halaman ganti password mandiri untuk akun
  // berbasis pegawai (baru admin bawaan yang punya /api/auth/password).
  const PASSWORD_RESET_BAWAAN = "user123";
  async function resetPassword(u) {
    if (!confirm(
      t("usersPage.confirmResetPassword", { name: u.nama || u.nip, nip: u.nip, password: PASSWORD_RESET_BAWAAN })
    )) return;
    try {
      const r = await apiFetch(`/api/users/${u.nip}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: PASSWORD_RESET_BAWAAN }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      ui.toast(t("usersPage.resetPasswordSuccessToast", { nip: u.nip, password: PASSWORD_RESET_BAWAAN }), { kind: "success" });
      load();
    } catch (err) { ui.reportError(t("usersPage.resetPasswordErrorMsg", { nip: u.nip }), err); }
  }

  async function changePassword(e) {
    e.preventDefault();
    setPassMsg("");
    try {
      const r = await apiFetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldPass, newPass }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setOldPass(""); setNewPass(""); setPassMsg(t("usersPage.adminPasswordChangedMsg"));
    } catch (err) { setPassMsg(t("usersPage.failedWithMsg", { msg: err.message })); }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-gray-900 mb-1">{t("usersPage.pageTitle")}</h1>
      <p className="text-gray-500 mb-6">
        {t("usersPage.pageSubtitle")}
      </p>

      {/* Daftarkan pengguna */}
      <form onSubmit={addUser}
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">{t("usersPage.nipLabel")}</label>
          <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-40"
            value={nip} onChange={(e) => setNip(e.target.value)} placeholder="000000003" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold text-gray-600 mb-1">{t("usersPage.nameLabel")}</label>
          <input className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            value={nama} onChange={(e) => setNama(e.target.value)}
            placeholder={t("usersPage.namePlaceholder")} />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-gray-600 mb-1">{t("usersPage.emailLabel")}</label>
          <input type="email" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="nama@contoh.com" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">{t("usersPage.passwordOptionalLabel")}</label>
          <input type="password"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-44"
            value={pass} onChange={(e) => setPass(e.target.value)}
            placeholder={t("usersPage.minCharsPlaceholder")} />
        </div>
        <button type="submit"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold text-sm">
          {t("usersPage.registerButton")}
        </button>
        {msg && <span className="text-sm text-gray-600 w-full">{msg}</span>}
      </form>

      {/* Daftar user */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2 font-semibold">{t("usersPage.nipHeader")}</th>
              <th className="px-4 py-2 font-semibold">{t("usersPage.nameHeader")}</th>
              <th className="px-4 py-2 font-semibold">{t("usersPage.emailHeader")}</th>
              <th className="px-4 py-2 font-semibold">{t("usersPage.roleHeader")}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.nip} className="border-t border-gray-100">
                <td className="px-4 py-2 font-mono">{u.nip}</td>
                <td className="px-4 py-2">{u.nama || <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-2 text-gray-500">{u.email || <span className="text-gray-400">—</span>}</td>
                <td className="px-4 py-2">
                  <button onClick={() => toggleRole(u)}
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      u.role === "admin"
                        ? "bg-violet-100 text-violet-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                    {u.role === "admin" ? t("role.admin") : t("role.user")} ⇄
                  </button>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  <button onClick={() => resetPassword(u)}
                    className="text-xs text-blue-600 hover:underline mr-3">{t("usersPage.resetPasswordButton")}</button>
                  <button onClick={() => removeUser(u.nip)}
                    className="text-xs text-red-500 hover:underline">{t("usersPage.removeButton")}</button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                {t("usersPage.noUsersText")}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modul Hak Akses per-item (B1) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 mb-0.5">{t("usersPage.aclHeading")}</h2>
          <p className="text-xs text-gray-500 max-w-2xl">
            {t("usersPage.aclDescPrefix")} <b>{t("usersPage.aclDescActiveWord")}</b>{t("usersPage.aclDescMiddle1")}
            {" "}<b>{t("usersPage.aclDescOffWord")}</b>{t("usersPage.aclDescMiddle2")}{" "}
            <b>{t("usersPage.aclDescNotWord")}</b> {t("usersPage.aclDescSuffix")}
          </p>
        </div>
        <button onClick={toggleAcl}
          className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${aclOn ? "bg-teal-500" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${aclOn ? "translate-x-7" : ""}`} />
        </button>
      </div>

      {/* Modul Upload CSV/Excel (#2) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 mb-0.5">{t("usersPage.uploadHeading")}</h2>
          <p className="text-xs text-gray-500 max-w-2xl">
            {t("usersPage.uploadDescPrefix")} <b>{t("usersPage.uploadDescActiveWord")}</b>{t("usersPage.uploadDescMiddle")}
            {" "}<code>dara_data_upl_</code>{t("usersPage.uploadDescSuffix")}
          </p>
        </div>
        <button onClick={toggleUpload}
          className={`relative w-14 h-7 rounded-full transition-colors shrink-0 ${uploadOn ? "bg-teal-500" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${uploadOn ? "translate-x-7" : ""}`} />
        </button>
      </div>

      {/* Mode Dev — popup error detail */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 mb-0.5">{t("usersPage.devModeHeading")}</h2>
          <p className="text-xs text-gray-500">
            {t("usersPage.devModeDescText")}
          </p>
        </div>
        <button onClick={toggleDevMode}
          className={`relative w-14 h-7 rounded-full transition-colors ${devMode ? "bg-teal-500" : "bg-gray-300"}`}>
          <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${devMode ? "translate-x-7" : ""}`} />
        </button>
      </div>

      {/* Ganti password admin lokal */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h2 className="font-bold text-gray-900 mb-1">{t("usersPage.adminPasswordHeading")}</h2>
        <p className="text-xs text-gray-500 mb-3">
          {t("usersPage.adminPasswordDescPrefix")} <code>admin123</code> {t("usersPage.adminPasswordDescSuffix")}
        </p>
        <form onSubmit={changePassword} className="flex flex-wrap gap-2 items-end">
          <input type="password" placeholder={t("usersPage.oldPasswordPlaceholder")}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={oldPass} onChange={(e) => setOldPass(e.target.value)} />
          <input type="password" placeholder={t("usersPage.newPasswordPlaceholder")}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            value={newPass} onChange={(e) => setNewPass(e.target.value)} />
          <button type="submit"
            className="px-4 py-2 rounded-lg bg-gray-800 text-white font-semibold text-sm">
            {t("usersPage.changePasswordButton")}
          </button>
          {passMsg && <span className="text-sm text-gray-600 w-full">{passMsg}</span>}
        </form>
      </div>

      {/* Log penggunaan (#3) */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 mt-6 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{t("usersPage.activityLogHeading")}</h2>
          <span className="text-xs text-gray-400">{t("usersPage.recentActivityCount", { count: activity.length })}</span>
        </div>
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-500 sticky top-0">
              <tr>
                <th className="px-3 py-2 font-semibold">{t("usersPage.timeHeader")}</th>
                <th className="px-3 py-2 font-semibold">{t("usersPage.userHeader")}</th>
                <th className="px-3 py-2 font-semibold">{t("usersPage.actionHeader")}</th>
                <th className="px-3 py-2 font-semibold">{t("usersPage.objectHeader")}</th>
                <th className="px-3 py-2 font-semibold">{t("usersPage.detailHeader")}</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((a, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 text-gray-500 whitespace-nowrap">
                    {new Date(a.ts).toLocaleString(lang === "en" ? "en-US" : "id")}
                  </td>
                  <td className="px-3 py-1.5 font-mono">{a.nip}{a.nama ? ` · ${a.nama}` : ""}</td>
                  <td className="px-3 py-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{a.action}</span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-600">{a.target}</td>
                  <td className="px-3 py-1.5 text-gray-500 truncate max-w-[240px]" title={a.detail}>{a.detail}</td>
                </tr>
              ))}
              {activity.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">{t("usersPage.noActivityText")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
