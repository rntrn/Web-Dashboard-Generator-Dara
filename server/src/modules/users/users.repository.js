/**
 * Users Repository — akses baris-per-baris ke `dara_data_pegawai`.
 *
 * SENGAJA TIDAK lewat metaStore (berbeda dari repository lain di DARA).
 * metaStore.writeAll() men-DELETE seluruh tabel lalu INSERT ulang — cocok
 * untuk koleksi kecil yang sepenuhnya dikuasai aplikasi (chart, dashboard),
 * tapi `dara_data_pegawai` JUGA berisi data HR yang tidak dikelola lewat
 * halaman Pengguna (bisa ratusan baris dari upload/seed). Kalau modul ini
 * memakai metaStore, mengubah SATU akun akan menghapus SEMUA pegawai lain.
 *
 * Jadi di sini kita bicara SQL langsung: INSERT/UPDATE/DELETE per baris,
 * tidak pernah TRUNCATE atau "ganti seluruh isi tabel".
 *
 * Kolom `password_hash` TIDAK PERNAH di-SELECT dengan `SELECT *` di sini
 * kecuali eksplisit dibutuhkan untuk verifikasi login (findAuthByIdentifier).
 * Untuk pertahanan berlapis, lihat juga databases.repository.js yang
 * menyaring kolom ini dari API data generik (Jelajah Data/Chart Builder).
 */

import Database from "../../config/database.js";

const db = new Database();
const TABLE = "dara_data_pegawai";

/** Kolom yang aman ditampilkan (tanpa password_hash). */
const SAFE_COLUMNS = `
  id, nip, nama, email, role_kode, status, is_user,
  last_login_at, unit_id, jabatan, golongan, gender,
  tanggal_masuk, gaji_pokok, created_at, updated_at
`;

const nowSql = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** Identifier berupa email bila mengandung "@", selain itu dianggap NIP. */
const isEmailLike = (s) => typeof s === "string" && s.includes("@");

export const usersRepository = {
  /** Semua akun (is_user=1), tanpa hash password. */
  async list() {
    return db.query(`SELECT ${SAFE_COLUMNS} FROM ${TABLE} WHERE is_user = 1 ORDER BY nip`);
  },

  /** Cari akun (is_user=1) by NIP, tanpa hash password. */
  async findByNip(nip) {
    return db.queryOne(`SELECT ${SAFE_COLUMNS} FROM ${TABLE} WHERE nip = ? AND is_user = 1`, [nip]);
  },

  /** Cari akun (is_user=1) by email, tanpa hash password. */
  async findByEmail(email) {
    return db.queryOne(`SELECT ${SAFE_COLUMNS} FROM ${TABLE} WHERE email = ? AND is_user = 1`, [email]);
  },

  /** Cari akun by identifier (email ATAU NIP, ditebak dari isi "@"), tanpa hash. */
  async findByIdentifier(identifier) {
    return isEmailLike(identifier) ? this.findByEmail(identifier) : this.findByNip(identifier);
  },

  /**
   * Cari baris pegawai APA PUN by NIP, termasuk yang is_user=0 (HR murni).
   * Dipakai saat "menambah pengguna" untuk mendeteksi apakah NIP ini
   * sudah ada sebagai data HR (maka di-promosikan, bukan dibuat baru).
   */
  async findAnyByNip(nip) {
    return db.queryOne(`SELECT ${SAFE_COLUMNS} FROM ${TABLE} WHERE nip = ?`, [nip]);
  },

  /**
   * Ambil baris LENGKAP termasuk password_hash — HANYA untuk verifikasi
   * login. Jangan pernah mengembalikan hasil fungsi ini lewat API.
   */
  async findAuthByIdentifier(identifier) {
    const col = isEmailLike(identifier) ? "email" : "nip";
    return db.queryOne(
      `SELECT id, nip, nama, email, password_hash, role_kode, status
       FROM ${TABLE} WHERE ${col} = ? AND is_user = 1`,
      [identifier]
    );
  },

  /** Cari untuk fitur "Bagikan" — hanya akun (is_user=1), min 4 karakter. */
  async search(q) {
    const s = String(q || "").trim();
    if (s.length < 4) return [];
    const rows = await db.query(
      `SELECT nip, nama FROM ${TABLE}
       WHERE is_user = 1 AND (nip LIKE ? OR LOWER(nama) LIKE ?)
       ORDER BY nip LIMIT 20`,
      [`${s}%`, `%${s.toLowerCase()}%`]
    );
    return rows;
  },

  /**
   * Buat akun baru ATAU promosikan pegawai HR yang sudah ada (upsert
   * berdasarkan NIP). Mengembalikan baris aman (tanpa hash).
   * @param {object} p { nip, nama, email, passwordHash, role }
   */
  async create({ nip, nama, email, passwordHash, role }) {
    const existing = await this.findAnyByNip(nip);
    const roleKode = role === "admin" ? "admin" : "editor";

    if (existing && existing.is_user) {
      throw new Error("NIP sudah terdaftar sebagai pengguna");
    }

    if (existing) {
      // Promosikan baris HR yang sudah ada — JANGAN sentuh kolom HR-nya.
      await db.exec(
        `UPDATE ${TABLE}
         SET nama = ?, email = ?, password_hash = ?, role_kode = ?,
             status = 'AKTIF', is_user = 1, updated_at = ?
         WHERE nip = ?`,
        [nama, email, passwordHash || null, roleKode, nowSql(), nip]
      );
    } else {
      await db.exec(
        `INSERT INTO ${TABLE}
           (nip, nama, email, password_hash, role_kode, status, is_user, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'AKTIF', 1, ?, ?)`,
        [nip, nama, email, passwordHash || null, roleKode, nowSql(), nowSql()]
      );
    }
    return this.findByNip(nip);
  },

  /** Ubah nama/role/status/password akun (is_user=1). */
  async update(nip, patch) {
    const existing = await this.findByNip(nip);
    if (!existing) throw new Error("NIP tidak ditemukan");

    const sets = [];
    const params = [];
    if (patch.nama !== undefined) { sets.push("nama = ?"); params.push(String(patch.nama).slice(0, 120)); }
    if (patch.role !== undefined) { sets.push("role_kode = ?"); params.push(patch.role === "admin" ? "admin" : "editor"); }
    if (patch.status !== undefined) { sets.push("status = ?"); params.push(patch.status === "NONAKTIF" ? "NONAKTIF" : "AKTIF"); }
    if (patch.passwordHash) { sets.push("password_hash = ?"); params.push(patch.passwordHash); }
    if (sets.length === 0) return existing;

    sets.push("updated_at = ?");
    params.push(nowSql(), nip);
    await db.exec(`UPDATE ${TABLE} SET ${sets.join(", ")} WHERE nip = ?`, params);
    return this.findByNip(nip);
  },

  /**
   * Cabut akses login sebuah NIP. Baris HANYA dihapus total bila tidak
   * punya data HR sama sekali (murni akun) — supaya menghapus akses login
   * tidak pernah ikut menghapus riwayat kepegawaian yang sah.
   */
  async remove(nip) {
    const row = await db.queryOne(
      `SELECT unit_id, jabatan, golongan, gender, tanggal_masuk, gaji_pokok
       FROM ${TABLE} WHERE nip = ? AND is_user = 1`,
      [nip]
    );
    if (!row) return false;

    const punyaDataHr = [row.unit_id, row.jabatan, row.golongan, row.gender, row.tanggal_masuk, row.gaji_pokok]
      .some((v) => v !== null && v !== undefined);

    if (punyaDataHr) {
      // Cabut login, sisakan data HR-nya utuh.
      await db.exec(
        `UPDATE ${TABLE}
         SET is_user = 0, password_hash = NULL, updated_at = ?
         WHERE nip = ?`,
        [nowSql(), nip]
      );
    } else {
      // Baris murni akun (bukan pegawai struktural) — aman dihapus total.
      await db.exec(`DELETE FROM ${TABLE} WHERE nip = ?`, [nip]);
    }
    return true;
  },

  /** Catat waktu login terakhir (best effort, tidak melempar). */
  async touchLogin(nip) {
    try {
      await db.exec(`UPDATE ${TABLE} SET last_login_at = ? WHERE nip = ?`, [nowSql(), nip]);
    } catch { /* tidak kritikal */ }
  },
};

export default usersRepository;
