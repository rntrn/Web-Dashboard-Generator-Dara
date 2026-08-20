/**
 * appTheme.js (DARA) — terapkan identitas/tema (appconfig) ke CSS variables.
 *
 * DARA memakai Tailwind. Untuk tema dinamis, kita set variabel
 * `--dara-accent`, `--dara-accent-2`, `--dara-bg` di :root lalu memakainya di
 * PERMUKAAN brand utama (sidebar aktif, tombol utama, login) via inline style /
 * beberapa aturan CSS.
 *
 * v0.40.0 — "tema minimal": permukaan inti (Btn primary/solid, PageHeader,
 * avatar, sidebar aktif) sekarang pakai `--dara-accent` SOLID, bukan gradien
 * 2 warna lagi — lebih bersih, satu aksen. `accentGradient`/`--dara-accent-2`
 * tetap diekspor untuk kompatibilitas mundur (mis. dipakai custom CSS lama),
 * tapi tidak lagi dipakai komponen inti.
 */

export const FONT_STACKS = {
  system: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif`,
  inter: `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  serif: `Georgia, "Times New Roman", "Noto Serif", serif`,
  mono: `ui-monospace, "SF Mono", Menlo, Consolas, monospace`,
  rounded: `"Segoe UI Rounded", "SF Pro Rounded", system-ui, "Segoe UI", sans-serif`,
};

export const FONT_OPTIONS = [
  { id: "system", label: "Sistem (default)" },
  { id: "inter", label: "Inter" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Monospace" },
  { id: "rounded", label: "Rounded" },
];

/** Preset tema: aksen utama + aksen ke-2 (gradien) + latar. */
export const THEME_PRESETS = [
  { id: "teal", name: "Teal → Sky (default)", accent: "#14b8a6", accent2: "#0ea5e9", bg: "#f1f5f9" },
  { id: "biru", name: "Biru", accent: "#2563eb", accent2: "#0ea5e9", bg: "#f1f5f9" },
  { id: "indigo", name: "Indigo", accent: "#6366f1", accent2: "#8b5cf6", bg: "#f3f4fb" },
  { id: "hijau", name: "Hijau", accent: "#16a34a", accent2: "#65a30d", bg: "#f4f7f4" },
  { id: "ungu", name: "Ungu", accent: "#8b5cf6", accent2: "#ec4899", bg: "#f7f4fc" },
  { id: "oranye", name: "Oranye", accent: "#ea580c", accent2: "#f59e0b", bg: "#faf6f2" },
  { id: "merah", name: "Merah", accent: "#dc2626", accent2: "#f97316", bg: "#faf5f5" },
  { id: "slate", name: "Slate", accent: "#334155", accent2: "#64748b", bg: "#f5f6f8" },
];

/**
 * Terapkan config ke dokumen: CSS variables + font + judul + favicon.
 * Aman dipanggil berkali-kali.
 */
export function applyAppConfig(cfg) {
  if (!cfg) return;
  const root = document.documentElement;
  const t = cfg.theme || {};
  if (t.accent) root.style.setProperty("--dara-accent", t.accent);
  if (t.accent2) root.style.setProperty("--dara-accent-2", t.accent2);
  if (t.bg) root.style.setProperty("--dara-bg", t.bg);
  const font = FONT_STACKS[t.font] || FONT_STACKS.system;
  root.style.setProperty("--dara-font", font);
  document.body.style.fontFamily = font;

  if (cfg.appName) document.title = `${cfg.appName} — ${cfg.tagline || "Dashboard & Reporting Generator"}`;

  if (cfg.faviconImage) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.href = cfg.faviconImage;
  }
}

/** Style gradien aksen (dipakai inline di sidebar aktif / tombol / login). */
export const accentGradient = "linear-gradient(90deg, var(--dara-accent), var(--dara-accent-2))";

export default applyAppConfig;
