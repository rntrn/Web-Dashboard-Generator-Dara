/**
 * Middleware autentikasi JWT (v0.9.0, ESM).
 * Token via header: Authorization: Bearer <token>
 * Payload: { nip, nama, role, src: "local" }
 */

import jwt from "jsonwebtoken";

// Placeholder bawaan .env contoh — TIDAK boleh dipakai di produksi.
const PLACEHOLDER_SECRET = "ganti-dengan-string-acak-panjang";

/**
 * Tentukan JWT secret dengan aman:
 *  - Produksi (NODE_ENV=production): WAJIB set JWT_SECRET yang bukan placeholder
 *    & cukup panjang — kalau tidak, tolak boot (fail-fast).
 *  - Dev: pakai .env bila ada; kalau kosong, buat acak per boot (sesi hangus
 *    saat restart) sambil memberi peringatan.
 */
function resolveSecret() {
  const s = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    if (!s || s === PLACEHOLDER_SECRET || s.length < 16) {
      throw new Error(
        "JWT_SECRET wajib diisi (≥16 karakter, bukan placeholder) di produksi. " +
        "Set variabel lingkungan JWT_SECRET lalu jalankan ulang."
      );
    }
    return s;
  }
  if (!s || s === PLACEHOLDER_SECRET) {
    console.warn("[DARA] PERINGATAN: JWT_SECRET belum di-set — memakai secret acak " +
      "sementara (semua sesi hangus saat restart). Set JWT_SECRET untuk produksi.");
    return `dev_${Math.random().toString(36).slice(2)}`;
  }
  return s;
}

export const JWT_SECRET = resolveSecret();

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Belum login" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Sesi habis, login ulang" });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ error: "Khusus admin" });
  next();
}

export default requireAuth;
