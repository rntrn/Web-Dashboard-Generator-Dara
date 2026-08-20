/**
 * LangToggle — tombol ganti bahasa ID ⇄ EN (Tailwind).
 * `dark` = varian untuk latar gelap (mis. sidebar midnight).
 */
import { useI18n } from "../i18n/I18nContext";
import { LANGS, LANG_LABELS } from "../i18n/translations";

export default function LangToggle({ dark = false }) {
  const { lang, setLang, t } = useI18n();
  const base = dark
    ? { wrap: "bg-white/10 border-white/15", on: "bg-white/90 text-slate-900", off: "text-slate-300 hover:text-white" }
    : { wrap: "bg-gray-100 border-gray-200", on: "bg-white text-teal-700 shadow-sm", off: "text-gray-500 hover:text-gray-800" };
  return (
    <div className={`inline-flex gap-0.5 p-0.5 rounded-full border ${base.wrap}`}
      role="group" aria-label={t("lang.title")} title={t("lang.title")}>
      {LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full leading-none transition-colors ${
            lang === l ? base.on : base.off}`}>
          {LANG_LABELS[l]}
        </button>
      ))}
    </div>
  );
}
