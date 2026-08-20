/** Appconfig service DARA: baca + simpan identitas/tema (admin). */
import { getConfig, saveConfig, DEFAULTS } from "../../config/appConfig.js";
import { logActivity } from "../../lib/activityLog.js";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const FONTS = ["system", "inter", "serif", "mono", "rounded"];
const MAX = { text: 80, tagline: 160, contributors: 30, contributorLen: 60 };
const IMG_MAX = 350000;
// Hanya RASTER (SVG ditolak → cegah XSS).
const DATA_IMG = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

function sanitizeImage(v) {
  if (v === "" || v == null) return "";
  const s = String(v);
  if (s.length > IMG_MAX) return undefined;
  if (!DATA_IMG.test(s)) return undefined;
  return s;
}

function sanitize(body) {
  const p = {};
  if (body.appName !== undefined) p.appName = clip(body.appName, MAX.text).trim() || DEFAULTS.appName;
  if (body.tagline !== undefined) p.tagline = clip(body.tagline, MAX.tagline);
  if (body.logo !== undefined) p.logo = clip(body.logo, 8);
  if (body.company !== undefined) p.company = clip(body.company, MAX.text);
  if (body.companyIcon !== undefined) p.companyIcon = clip(body.companyIcon, 8);
  if (body.contributors !== undefined) {
    const arr = Array.isArray(body.contributors) ? body.contributors : [];
    p.contributors = arr.map((s) => clip(s, MAX.contributorLen).trim()).filter(Boolean).slice(0, MAX.contributors);
  }
  for (const key of ["logoImage", "faviconImage", "companyImage"]) {
    if (body[key] !== undefined) {
      const img = sanitizeImage(body[key]);
      if (img !== undefined) p[key] = img;
    }
  }
  if (body.theme && typeof body.theme === "object") {
    const t = {}, th = body.theme;
    if (th.accent !== undefined && HEX.test(th.accent)) t.accent = th.accent;
    if (th.accent2 !== undefined && HEX.test(th.accent2)) t.accent2 = th.accent2;
    if (th.bg !== undefined && HEX.test(th.bg)) t.bg = th.bg;
    if (th.font !== undefined && FONTS.includes(th.font)) t.font = th.font;
    p.theme = t;
  }
  return p;
}

export const appconfigService = {
  get() { return getConfig(); },
  update(body, user = null) {
    if (!body || typeof body !== "object") throw new Error("Body tidak valid");
    const next = saveConfig(sanitize(body));
    logActivity(user, "update", "appconfig", Object.keys(sanitize(body)).join(","));
    return next;
  },
};

export default appconfigService;
