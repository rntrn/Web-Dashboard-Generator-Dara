/**
 * Uploads Service — unggah CSV/Excel jadi tabel di DB (MySQL/SQLite).
 *
 * Alur: frontend mem-parse file → kirim { name, columns:[nama...], rows:[[...]] }.
 * Backend: bikin tabel `dara_data_upl_*` (prefix agar tampil di Jelajah Data,
 * tapi ter-ACL: hanya pembuat+admin, kecuali dibagikan), lalu INSERT massal.
 *
 * Batas: baris ≤ 100.000, kolom ≤ 80, panjang nama tabel/kolom ≤ 30 char.
 * Metadata upload disimpan di metaStore "uploads" (untuk daftar + ACL + hapus).
 */

import Database from "../../config/database.js";
import { metaStore } from "../../config/metaStore.js";
import { usersService } from "../users/users.service.js";
import { canManageItem, sanitizeSharedWith } from "../../lib/acl.js";
import { ident as quoteIdent, uploadColumnType } from "../../lib/dialect.js";
import { ID_MAX, safeIdent, uniqueCols, sanitizeCell, inferTypes, uniqueTableSuffix } from "../../lib/tableImport.js";

/**
 * Akses tabel UPLOAD selalu privat (tak bergantung toggle ACL global):
 * hanya admin, pembuat, atau NIP yang dibagikan.
 */
function canAccessUpload(meta, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (meta.createdBy && meta.createdBy.nip === user.nip) return true;
  return !!(Array.isArray(meta.sharedWith) && meta.sharedWith.includes(user.nip));
}

const db = new Database();
const COLLECTION = "uploads";
const PREFIX = (process.env.DB_TABLE_PREFIX || "dara_data_");
const MAX_ROWS = 100000;
const MAX_COLS = 80;
// ID_MAX (30, bukan 64 seperti MySQL) sengaja dipilih agar nama tabel hasil
// upload tetap aman bila database dipindah ke driver dengan batas lebih
// pendek — didefinisikan di lib/tableImport.js (dipakai bareng import
// Data Connection, lihat connections/connImports.service.js).

const ident = (c) => quoteIdent(c, db.dbType);
const tableRef = (t) => quoteIdent(t, db.dbType);

export { sanitizeCell }; // re-export untuk kompatibilitas modul lain yang mungkin mengimpornya dari sini — sumber asli di lib/tableImport.js

/**
 * Definisi kolom untuk tabel hasil upload.
 * MySQL : DOUBLE / TEXT   ·  SQLite : REAL / TEXT
 * Tipe sengaja longgar — data upload belum tentu bersih, biar tidak gagal
 * di tengah impor karena satu baris menyimpang.
 */
const colDDL = (name, t) =>
  `${ident(name)} ${uploadColumnType(t === "num" ? "NUMBER" : "TEXT", db.dbType)}`;

export const uploadsService = {
  isEnabled() { return usersService.getUploadEnabled(); },

  list(user = null) {
    const all = metaStore.readAll(COLLECTION);
    return user ? all.filter((m) => canAccessUpload(m, user)) : all;
  },

  /** Nama tabel yang berasal dari upload (untuk filter ACL di daftar tabel). */
  uploadedTables() {
    return new Set(metaStore.readAll(COLLECTION).map((u) => u.tableName.toUpperCase()));
  },

  /** Boleh akses tabel ini? (tabel global = ya; tabel upload = selalu privat). */
  canAccessTable(tableName, user) {
    const meta = metaStore.readAll(COLLECTION).find(
      (u) => u.tableName.toUpperCase() === String(tableName).toUpperCase());
    if (!meta) return true;             // bukan tabel upload → global
    return canAccessUpload(meta, user);
  },

  /**
   * Buat tabel dari data upload. `columns` = array nama asli; `rows` =
   * array-of-array (selaras kolom).
   */
  async create({ name, columns, rows }, user = null) {
    if (!this.isEnabled()) throw new Error("Modul upload dimatikan admin");
    const displayName = String(name || "").trim();
    if (!displayName) throw new Error("Nama tabel wajib diisi");
    if (!Array.isArray(columns) || columns.length === 0) throw new Error("Kolom kosong");
    if (columns.length > MAX_COLS) throw new Error(`Kolom terlalu banyak (maks ${MAX_COLS})`);
    if (!Array.isArray(rows)) throw new Error("Baris tidak valid");
    if (rows.length > MAX_ROWS) throw new Error(`Baris terlalu banyak (maks ${MAX_ROWS.toLocaleString("id")})`);

    const safeCols = uniqueCols(columns);
    const types = inferTypes(safeCols, rows);

    // Nama tabel: PREFIX + upl_ + slug + basis-36 waktu, dipangkas ≤30.
    const slug = safeIdent(displayName, "data").slice(0, 8);
    let tableName = `${PREFIX}upl_${slug}_${uniqueTableSuffix()}`.slice(0, ID_MAX);

    // DDL
    const ddl = `CREATE TABLE ${tableRef(tableName)} (${safeCols.map((c, i) => colDDL(c, types[i])).join(", ")})`;
    await db.exec(ddl);

    // INSERT massal
    if (rows.length) {
      const placeholders = safeCols.map(() => "?").join(", ");
      const sql = `INSERT INTO ${tableRef(tableName)} (${safeCols.map(ident).join(", ")}) VALUES (${placeholders})`;
      const data = rows.map((r) =>
        safeCols.map((_, ci) => sanitizeCell(r[ci], types[ci])));
      await db.execMany(sql, data);
    }

    const meta = {
      id: `upl_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tableName,
      name: displayName.slice(0, 120),
      columns: safeCols.map((c, i) => ({ name: c, orig: String(columns[i]), type: types[i] })),
      rowCount: rows.length,
      createdBy: user ? { nip: user.nip, nama: user.nama } : null,
      sharedWith: [],
      createdAt: new Date().toISOString(),
    };
    const all = metaStore.readAll(COLLECTION);
    all.push(meta);
    metaStore.writeAll(COLLECTION, all);
    return meta;
  },

  async remove(id, user = null) {
    const all = metaStore.readAll(COLLECTION);
    const meta = all.find((u) => u.id === id);
    if (!meta) return false;
    if (!canManageItem(meta, user))
      throw new Error("Hanya pembuat atau admin yang boleh menghapus tabel ini");
    try { await db.exec(`DROP TABLE ${tableRef(meta.tableName)}`); } catch { /* tabel mungkin sudah hilang */ }
    metaStore.writeAll(COLLECTION, all.filter((u) => u.id !== id));
    return true;
  },

  setSharedWith(id, nips, user = null) {
    const all = metaStore.readAll(COLLECTION);
    const meta = all.find((u) => u.id === id);
    if (!meta) throw new Error("Tabel tidak ditemukan");
    if (!canManageItem(meta, user))
      throw new Error("Hanya pembuat atau admin yang boleh membagikan tabel ini");
    meta.sharedWith = sanitizeSharedWith(nips);
    metaStore.writeAll(COLLECTION, all);
    return meta;
  },
};

export default uploadsService;
