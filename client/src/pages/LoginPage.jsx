import { useState } from "react";
import { setSession } from "../api/http";
import Logo from "../components/Logo";
import LangToggle from "../components/LangToggle";
import { useI18n } from "../i18n/I18nContext";

/**
 * LoginPage — DARA Free. Dua jalur, keduanya diverifikasi secara lokal:
 *  - "admin"        -> akun administrator bawaan (password awal admin123, WAJIB ganti)
 *  - email ATAU NIP -> pengguna yang didaftarkan admin dan sudah punya password
 */
export default function LoginPage({ onLogin, appcfg }) {
  const { t } = useI18n();
  const appName = appcfg?.appName || "DARA";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error || "Login gagal");
      setSession(json.data.token, json.data.user);
      onLogin(json.data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "radial-gradient(1200px 600px at 20% -10%, #0e2a2e 0%, #0b1120 45%, #0b1120 100%)" }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-2"><LangToggle dark /></div>
        <div className="flex flex-col items-center mb-8">
          <Logo size={64} image={appcfg?.logoImage || ""} />
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
            {appName}
          </h1>
          <p className="text-slate-300 text-sm mt-1 font-semibold tracking-wide">
            {appcfg?.tagline || t("login.subtitle")}
          </p>
          {(appcfg?.company || appcfg?.companyImage) && (
            <p className="text-slate-400 text-xs mt-2 flex items-center gap-1.5">
              {appcfg.companyImage
                ? <img src={appcfg.companyImage} alt="" className="h-4 w-4 object-contain" />
                : (appcfg.companyIcon || null)}
              {appcfg.company}
            </p>
          )}
        </div>

        <form onSubmit={submit}
          className="bg-white rounded-2xl shadow-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Email atau NIP
            </label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={identifier} autoFocus
              placeholder="nama@contoh.com atau NIP"
              onChange={(e) => setIdentifier(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Password
            </label>
            <input type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <button type="submit" disabled={busy}
            className="w-full py-2.5 rounded-lg text-white font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
            style={{ background: "var(--dara-accent)" }}>
            {busy ? "Memproses..." : "Masuk"}
          </button>

          <p className="text-[11px] text-gray-400 text-center">
            Login dengan email atau NIP yang sudah didaftarkan admin.
          </p>
        </form>
      </div>
    </div>
  );
}
