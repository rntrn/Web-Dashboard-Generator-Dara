/**
 * I18nContext — penyedia bahasa aktif + fungsi terjemah `t()` untuk DARA.
 * Pola sama dengan MANDOR. Bahasa disimpan di localStorage ("dara_lang").
 *
 *   <I18nProvider><App/></I18nProvider>          // di main.jsx
 *   const { t, lang, setLang } = useI18n();        // di komponen
 */

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { translations, DEFAULT_LANG, LANGS } from "./translations.js";

const STORAGE_KEY = "dara_lang";
const I18nContext = createContext(null);

function readInitialLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* localStorage tak tersedia -> default */ }
  return DEFAULT_LANG;
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);

  const setLang = useCallback((next) => {
    if (!LANGS.includes(next)) return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* abaikan */ }
    document.documentElement.lang = next;
    setLangState(next);
  }, []);

  /** Terjemah satu kunci. Fallback: bahasa aktif → id → kunci mentah. */
  const t = useCallback((key, vars) => {
    const dict = translations[lang] || translations[DEFAULT_LANG];
    let s = dict[key] ?? translations[DEFAULT_LANG][key] ?? key;
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
      }
    }
    return s;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n() harus dipakai di dalam <I18nProvider>");
  return ctx;
}

export default I18nContext;
