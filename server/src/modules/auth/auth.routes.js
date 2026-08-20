/**
 * Auth Routes — /api/auth (DARA FREE: autentikasi lokal, tanpa LDAP)
 *
 * POST /login    { identifier, password }
 *   Dua jalur, dicoba berurutan (bukan lewat tebakan format identifier):
 *   1. identifier cocok username admin bawaan (dara_settings) -> admin lokal
 *   2. selain itu, identifier dicari sebagai EMAIL atau NIP pegawai
 *      (dara_data_pegawai, is_user=1) — ditebak dari ada/tidaknya "@"
 *   -> { token, user: {nip, nama, role, src} }
 *
 * GET  /me                     -> profil dari token
 * POST /password { oldPass, newPass } -> ganti password admin lokal (admin only)
 */

import { Router } from "express";
import jwt from "jsonwebtoken";
import { usersService, ensureLocalAdmin } from "../users/users.service.js";
import { JWT_SECRET, requireAuth, requireAdmin } from "../../middlewares/auth.js";
import { loginRateLimit } from "../../middlewares/rateLimit.js";
import { logActivity } from "../../lib/activityLog.js";

const router = Router();
// Catatan: ensureLocalAdmin() TIDAK dipanggil di sini. Modul ini dimuat saat
// `import app`, sebelum metaStore selesai memuat data dari MySQL — memanggilnya
// di sini akan membuat admin baru dan menimpa pengaturan yang sudah ada.
// Pemanggilannya dilakukan di src/server.js setelah metaStore.init().

function issueToken(user) {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

// Rate-limit login untuk cegah brute-force (per IP).
router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    if (!identifier || !password)
      return res.status(400).json({ error: "Isi email/NIP dan password" });

    // ---- 1) Admin lokal bawaan ----
    if (usersService.verifyLocalAdmin(identifier, password)) {
      const user = { nip: "admin", nama: "Administrator", role: "admin", src: "local" };
      logActivity(user, "login", "auth", "admin lokal");
      return res.json({ data: { token: issueToken(user), user } });
    }

    // ---- 2) Pegawai/pengguna aplikasi (identifier = email atau NIP) ----
    const verified = await usersService.verifyLocalUser(identifier, password);
    if (!verified) {
      // Pesan sengaja tidak membedakan "tidak ditemukan", "password salah",
      // atau "belum punya password" — supaya tidak membocorkan status akun.
      return res.status(401).json({ error: "Email/NIP atau password salah" });
    }

    const user = { ...verified, src: "local" };
    logActivity(user, "login", "auth", "pengguna lokal");
    res.json({ data: { token: issueToken(user), user } });
  } catch (err) {
    console.error("Error login:", err);
    res.status(500).json({ error: "Gagal memproses login" });
  }
});

router.get("/me", requireAuth, (req, res) => {
  // sertakan devMode + status modul ACL (global, di-toggle admin)
  res.json({ data: {
    ...req.user,
    devMode: usersService.getDevMode(),
    aclEnabled: usersService.getAclEnabled(),
    uploadEnabled: usersService.getUploadEnabled(),
  } });
});

router.post("/password", requireAuth, requireAdmin, (req, res) => {
  try {
    const { oldPass, newPass } = req.body || {};
    usersService.changeLocalAdminPassword(oldPass, newPass);
    res.json({ data: { changed: true } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
