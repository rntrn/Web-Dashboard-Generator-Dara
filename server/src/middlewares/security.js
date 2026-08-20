/**
 * security.js — middleware keamanan ringan TANPA dependency tambahan.
 *
 * Berisi dua hal:
 *   1) securityHeaders — header keamanan dasar untuk semua respons.
 *   2) cors            — CORS whitelist origin (dari env CORS_ORIGINS).
 *
 * Sengaja ditulis manual (bukan helmet/cors) agar tetap ringan & mudah dibaca.
 *
 * SETTINGS (.env):
 *   CORS_ORIGINS  Daftar origin yang boleh akses API, dipisah koma.
 *                 Contoh: https://mandor.intranet.pajak.go.id,http://localhost:5173
 *                 Kosong = tidak mengirim header CORS (aman untuk same-origin
 *                 / pemakaian via proxy Vite saat dev).
 */

/** Daftar origin yang diizinkan (dibaca sekali). */
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Header keamanan dasar. API DARA hanya mengembalikan JSON, jadi aman memasang
 * proteksi framing/sniffing di sini. (Framing halaman EMBED untuk MANDOR terjadi
 * di sisi FRONTEND, bukan respons API ini — ditangani terpisah saat build produksi
 * menyajikan static FE.)
 */
export function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.removeHeader("X-Powered-By"); // jangan bocorkan "Express"
  next();
}

/**
 * CORS whitelist. Hanya mengirim header untuk origin yang terdaftar.
 * Menangani preflight OPTIONS. Tanpa CORS_ORIGINS → lewati (same-origin).
 */
export function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}

export default { securityHeaders, cors };
