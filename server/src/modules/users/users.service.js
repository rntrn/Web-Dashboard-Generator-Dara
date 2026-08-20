/**
 * Users Service — pengguna aplikasi (akun pegawai) + akun admin bawaan.
 *
 * Model akses DARA FREE:
 *  - Pengguna aplikasi = baris di `dara_data_pegawai` dengan is_user=1.
 *    Login pakai EMAIL atau NIP (salah satu), password di-hash bcrypt.
 *    Akses SQL baris-per-baris lewat users.repository.js — lihat catatan
 *    desain di sana (KENAPA bukan lewat metaStore).
 *  - Terpisah dari itu, ada SATU akun admin bawaan (username "admin",
 *    default di dara_settings) sebagai jalur masuk darurat yang tidak
 *    bergantung pada tabel pegawai sama sekali. Ini metaStore biasa
 *    (koleksi "settings", singleton) — TIDAK diubah oleh redesain ini.
 *
 * Field `role` pada objek user yang dikembalikan (dan disimpan di JWT)
 * hanya bernilai "admin" | "user" — dua nilai sederhana yang dipakai di
 * seluruh kode (acl.js, requireAdmin, dll). Kolom SQL `role_kode` yang
 * sebenarnya (admin/editor/viewer) lebih rinci, disimpan untuk kebutuhan
 * masa depan (penegakan permission per-peran granular).
 */

import bcrypt from "bcryptjs";
import { metaStore } from "../../config/metaStore.js";
import { usersRepository } from "./users.repository.js";

const SETTINGS = "settings";
const DEFAULT_ADMIN_PASS = "admin123"; // WAJIB diganti setelah login pertama

// NIP: sampai 30 karakter, huruf/angka/titik/garis (bukan hanya digit lagi —
// versi lama mewajibkan persis 9 digit, dilonggarkan sesuai kebutuhan).
const NIP_RE = /^[A-Za-z0-9._-]{1,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ubah role_kode SQL (admin/editor/viewer) → role aplikasi (admin/user). */
const toAppRole = (roleKode) => (roleKode === "admin" ? "admin" : "user");

/** Ambil objek settings (array berisi 1 objek, konvensi metaStore). */
function getSettings() {
  const all = metaStore.readAll(SETTINGS);
  return all[0] || null;
}

function saveSettings(s) {
  metaStore.writeAll(SETTINGS, [s]);
}

/** Pastikan admin lokal default ada saat server pertama kali jalan. */
export function ensureLocalAdmin() {
  let s = getSettings();
  if (!s || !s.adminHash) {
    s = {
      adminUser: "admin",
      adminHash: bcrypt.hashSync(DEFAULT_ADMIN_PASS, 10),
      createdAt: new Date().toISOString(),
    };
    saveSettings(s);
    console.log("⚠ Admin lokal dibuat: username 'admin' password 'admin123' — SEGERA GANTI.");
  }
  return s;
}

export const usersService = {
  /** Daftar akun pengguna (is_user=1). Password hash tidak pernah ikut. */
  async list() {
    const rows = await usersRepository.list();
    return rows.map((u) => ({
      nip: u.nip,
      nama: u.nama,
      email: u.email,
      role: toAppRole(u.role_kode),
      status: u.status,
      lastLoginAt: u.last_login_at,
      createdAt: u.created_at,
    }));
  },

  /**
   * Daftarkan pengguna baru, ATAU beri akses login ke pegawai HR yang
   * sudah ada dengan NIP yang sama (data HR-nya tidak tersentuh).
   * @param {object} p { nip, nama, email, role, password }
   *   password opsional; bila kosong pengguna belum bisa login sampai
   *   admin menyetel password lewat setPassword().
   */
  async add({ nip, nama, email, role, password }) {
    nip = String(nip || "").trim();
    email = String(email || "").trim().toLowerCase();
    nama = String(nama || "").trim();

    if (!NIP_RE.test(nip))
      throw new Error("NIP tidak valid — maksimal 30 karakter (huruf, angka, titik, garis bawah/hubung)");
    if (!EMAIL_RE.test(email))
      throw new Error("Email tidak valid");
    if (!nama)
      throw new Error("Nama wajib diisi");
    if (password && password.length < 6)
      throw new Error("Password minimal 6 karakter");

    const existingEmail = await usersRepository.findByEmail(email);
    if (existingEmail && existingEmail.nip !== nip)
      throw new Error("Email sudah dipakai akun lain");

    const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
    const row = await usersRepository.create({ nip, nama, email, passwordHash, role });
    return { nip: row.nip, nama: row.nama, email: row.email, role: toAppRole(row.role_kode), status: row.status };
  },

  /** Setel/ganti password akun (admin only). */
  async setPassword(nip, newPass) {
    if (!newPass || newPass.length < 6)
      throw new Error("Password minimal 6 karakter");
    const hash = bcrypt.hashSync(newPass, 10);
    const row = await usersRepository.update(nip, { passwordHash: hash });
    if (!row) throw new Error("NIP tidak ditemukan");
    return true;
  },

  /**
   * Verifikasi login. `identifier` boleh email ATAU NIP (ditebak dari "@").
   * @returns {Promise<object|null>} user tanpa hash bila cocok, null bila gagal
   */
  async verifyLocalUser(identifier, password) {
    const id = String(identifier || "").trim();
    if (!id) return null;
    const u = await usersRepository.findAuthByIdentifier(id);
    if (!u || !u.password_hash) return null;
    if (u.status === "NONAKTIF") return null;
    if (!bcrypt.compareSync(password || "", u.password_hash)) return null;
    await usersRepository.touchLogin(u.nip);
    return { nip: u.nip, nama: u.nama || u.nip, role: toAppRole(u.role_kode) };
  },

  /** Ubah nama/role/status/password. Hash tidak pernah dikembalikan. */
  async update(nip, patch) {
    const p = {};
    if (patch.nama !== undefined) p.nama = patch.nama;
    if (patch.role !== undefined) p.role = patch.role;
    if (patch.status !== undefined) p.status = patch.status;
    if (patch.password) {
      if (patch.password.length < 6) throw new Error("Password minimal 6 karakter");
      p.passwordHash = bcrypt.hashSync(patch.password, 10);
    }
    const row = await usersRepository.update(nip, p);
    return { nip: row.nip, nama: row.nama, email: row.email, role: toAppRole(row.role_kode), status: row.status };
  },

  /**
   * Cabut akses login sebuah NIP. Kalau baris itu juga punya data HR asli
   * (unit/jabatan/dll), data HR-nya DIPERTAHANKAN — hanya akses login yang
   * dicabut. Baris yang murni akun (tanpa data HR) dihapus total.
   */
  async remove(nip) {
    return usersRepository.remove(nip);
  },

  /** Cari akun by NIP (tanpa hash). */
  async findByNip(nip) {
    return usersRepository.findByNip(nip);
  },

  /**
   * Cari pengguna untuk fitur "Bagikan". Cocok bila NIP diawali q atau nama
   * mengandung q (case-insensitive). Minimal 4 karakter.
   * @returns {Promise<Array<{nip,nama}>>} maks 20.
   */
  async search(q) {
    return usersRepository.search(q);
  },

  // ---- Modul ACL (hak akses per-item) — toggle admin ----
  getAclEnabled() {
    const s = ensureLocalAdmin();
    return !!s.aclEnabled;
  },
  setAclEnabled(on) {
    const s = ensureLocalAdmin();
    s.aclEnabled = !!on;
    saveSettings(s);
    return s.aclEnabled;
  },

  // ---- Modul Upload CSV/Excel — toggle admin ----
  getUploadEnabled() {
    const s = ensureLocalAdmin();
    return !!s.uploadEnabled;
  },
  setUploadEnabled(on) {
    const s = ensureLocalAdmin();
    s.uploadEnabled = !!on;
    saveSettings(s);
    return s.uploadEnabled;
  },

  // ---- Admin lokal (singleton, terpisah dari tabel pegawai) ----

  verifyLocalAdmin(username, password) {
    const s = ensureLocalAdmin();
    if (username !== s.adminUser) return false;
    return bcrypt.compareSync(password, s.adminHash);
  },

  changeLocalAdminPassword(oldPass, newPass) {
    const s = ensureLocalAdmin();
    if (!bcrypt.compareSync(oldPass, s.adminHash))
      throw new Error("Password lama salah");
    if (!newPass || newPass.length < 6)
      throw new Error("Password baru minimal 6 karakter");
    s.adminHash = bcrypt.hashSync(newPass, 10);
    s.updatedAt = new Date().toISOString();
    saveSettings(s);
    return true;
  },

  // ---- Mode Dev (popup error detail) — toggle admin ----

  getDevMode() {
    const s = ensureLocalAdmin();
    return !!s.devMode;
  },

  setDevMode(on) {
    const s = ensureLocalAdmin();
    s.devMode = !!on;
    saveSettings(s);
    return s.devMode;
  },
};

export default usersService;
