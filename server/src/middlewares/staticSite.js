/**
 * staticSite.js — sajikan frontend (hasil `vite build`) dari Express, sehingga
 * DARA berjalan di SATU origin (FE + API). Diaktifkan lewat env SERVE_STATIC.
 *
 * Kenapa satu origin: menyederhanakan deploy (satu port di balik reverse proxy
 * HTTPS), menghindari CORS internal, dan membuat cookie/same-origin lebih aman.
 *
 * Yang ditangani:
 *  1) File statis dari client/dist.
 *  2) SPA fallback: rute non-/api dikembalikan index.html (React Router sisi
 *     klien). Permintaan /api DILEWATI agar 404 API tetap berfungsi.
 *  3) Framing EMBED: halaman /view/* & /story/* boleh di-iframe oleh MANDOR.
 *     Header global memasang X-Frame-Options: SAMEORIGIN; untuk rute embed ini
 *     kita GANTI dengan Content-Security-Policy: frame-ancestors (whitelist).
 *
 * SETTINGS (.env):
 *   SERVE_STATIC=true                Aktifkan penyajian FE oleh Express (produksi).
 *   EMBED_FRAME_ANCESTORS=...        Origin yang boleh mem-frame halaman embed,
 *                                    dipisah spasi. Contoh:
 *                                    "https://mandor.intranet.pajak.go.id"
 *                                    Kosong = hanya 'self'.
 */

import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/middlewares -> ../../../client/dist
const DIST_DIR = path.resolve(__dirname, "../../../client/dist");

/** Origin yang diizinkan mem-frame halaman embed. */
const FRAME_ANCESTORS = (process.env.EMBED_FRAME_ANCESTORS || "")
  .split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

/** Apakah path termasuk halaman embed (boleh di-iframe MANDOR)? */
function isEmbedPath(p) {
  return p.startsWith("/view/") || p.startsWith("/story/")
    || p === "/view" || p === "/story";
}

/** Set header framing untuk halaman embed (override X-Frame-Options global). */
function applyEmbedFraming(res) {
  res.removeHeader("X-Frame-Options");
  const ancestors = ["'self'", ...FRAME_ANCESTORS].join(" ");
  res.setHeader("Content-Security-Policy", `frame-ancestors ${ancestors}`);
}

/**
 * Pasang penyajian statis + SPA fallback. Panggil SETELAH semua rute /api,
 * dan SEBELUM handler 404/error. No-op bila SERVE_STATIC ≠ "true".
 * @returns {boolean} true bila static diaktifkan.
 */
export function serveStatic(app) {
  if (process.env.SERVE_STATIC !== "true") return false;
  if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
    console.warn(`[DARA] SERVE_STATIC=true tapi build FE tidak ditemukan di ${DIST_DIR}. ` +
      `Jalankan "npm run build" di folder client dulu.`);
    return false;
  }

  // Aset statis (JS/CSS/gambar). index.html ditangani manual agar bisa set
  // header framing per-rute.
  app.use(express.static(DIST_DIR, { index: false, maxAge: "1h" }));

  // SPA fallback untuk GET non-/api.
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next(); // biarkan 404 API bekerja
    if (isEmbedPath(req.path)) applyEmbedFraming(res);
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });

  console.log(`[DARA] Menyajikan frontend statis dari ${DIST_DIR}` +
    (FRAME_ANCESTORS.length ? ` (embed frame-ancestors: ${FRAME_ANCESTORS.join(", ")})` : ""));
  return true;
}

export default serveStatic;
