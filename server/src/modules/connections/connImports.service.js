/**
 * connImports.service.js — Data Connection Fase 1: import/materialize.
 *
 * Menjawab keterbatasan arsitektur yang dijelaskan di
 * docs/08-data-connection.md ("Kenapa bukan live query lintas-database?"):
 * DARA cuma pakai SATU koneksi database aktif untuk metadata `dara_*` DAN
 * semua tabel sumber dashboard `dara_data_*`. Jadi Data Connection (Fase 0,
 * test/listTables/previewRows) tidak bisa langsung dipakai Chart
 * Builder/Dashboard — datanya masih "di luar". Modul INI menjembatani:
 * tarik baris dari koneksi eksternal tersimpan (connections.service.js),
 * simpan sebagai tabel BARU `dara_data_conn_*` di database DARA sendiri,
 * baru dashboard membacanya seperti tabel biasa (sama seperti alur upload
 * CSV/Excel yang sudah ada).
 *
 * REUSE SENGAJA:
 *   - Logika bikin-tabel-dari-data-tabular (safeIdent/uniqueCols/inferTypes/
 *     sanitizeCell) diambil dari lib/tableImport.js — SAMA PERSIS dengan
 *     yang dipakai uploads.service.js, supaya penamaan kolom & deteksi tipe
 *     konsisten di seluruh DARA, bukan implementasi kedua yang beda-beda.
 *   - Pola metadata + ACL (privat: pembuat+admin+dibagikan) juga meniru
 *     uploads.service.js persis — lihat canAccessImport() di bawah.
 *
 * PEMISAHAN AKSES (penting, lihat connections.routes.js vs connImports.routes.js):
 *   - importTable() di sini HANYA dipanggil dari connections.routes.js, yang
 *     admin-only (kredensial koneksi eksternal sensitif) — TIDAK ada endpoint
 *     lain yang memicu import.
 *   - list()/setSharedWith()/remove() dipakai connImports.routes.js yang
 *     cuma requireAuth (BUKAN requireAdmin) — karena tabel HASIL import
 *     harus bisa dipakai/dibagikan seperti tabel upload biasa oleh siapa pun
 *     yang diberi akses, bukan cuma admin. ACL di dalam method ini yang
 *     tetap menjaga: non-pemilik/non-admin tidak bisa apa-apa kecuali diberi
 *     akses lewat sharedWith.
 *
 * Baris DIBATASI (MAX_ROWS) — ini SEKALI TARIK, bukan sinkronisasi berkala.
 * Sinkronisasi terjadwal + recipe Data Preparation = Fase 2/3 (lihat
 * docs/08-data-connection.md "Rencana fase berikutnya").
 */

import Database from "../../config/database.js";
import { metaStore } from "../../config/metaStore.js";
import { canManageItem, sanitizeSharedWith } from "../../lib/acl.js";
import { ident as quoteIdent, uploadColumnType } from "../../lib/dialect.js";
import { ID_MAX, safeIdent, uniqueCols, sanitizeCell, inferTypes, uniqueTableSuffix } from "../../lib/tableImport.js";
import { connectionsService } from "./connections.service.js";

/** Akses tabel hasil IMPORT selalu privat: admin, pembuat, atau NIP dibagikan. */
function canAccessImport(meta, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (meta.createdBy && meta.createdBy.nip === user.nip) return true;
  return !!(Array.isArray(meta.sharedWith) && meta.sharedWith.includes(user.nip));
}

const db = new Database();
const COLLECTION = "connImports";
const PREFIX = (process.env.DB_TABLE_PREFIX || "dara_data_");
// Sama seperti batas upload (uploads.service.js) — konsisten satu batas di
// seluruh DARA Free, cukup untuk skenario dashboard SME. Sinkronisasi data
// besar/berkala BUKAN tujuan Fase 1 (lihat docs/08-data-connection.md).
const MAX_ROWS = 100000;
// Lebih longgar dari upload (80) karena sumbernya skema database asli
// (bukan input bebas pengguna lewat file), tapi tetap dibatasi.
const MAX_COLS = 200;

const ident = (c) => quoteIdent(c, db.dbType);
const tableRef = (t) => quoteIdent(t, db.dbType);

/** Definisi kolom tabel hasil import — sama seperti uploads.service.js. */
const colDDL = (name, t) =>
  `${ident(name)} ${uploadColumnType(t === "num" ? "NUMBER" : "TEXT", db.dbType)}`;

export const connImportsService = {
  list(user = null) {
    const all = metaStore.readAll(COLLECTION);
    return user ? all.filter((m) => canAccessImport(m, user)) : all;
  },

  /** Nama tabel yang berasal dari import koneksi (untuk filter ACL di daftar tabel). */
  importedTables() {
    return new Set(metaStore.readAll(COLLECTION).map((m) => m.tableName.toUpperCase()));
  },

  /** Boleh akses tabel ini? (tabel global = ya; tabel hasil import = selalu privat). */
  canAccessTable(tableName, user) {
    const meta = metaStore.readAll(COLLECTION).find(
      (m) => m.tableName.toUpperCase() === String(tableName).toUpperCase());
    if (!meta) return true; // bukan tabel hasil import → global
    return canAccessImport(meta, user);
  },

  /**
   * Tarik baris dari `sourceTable` pada koneksi `connectionId` (dibatasi
   * MAX_ROWS), materialize jadi tabel baru `dara_data_conn_*`.
   *
   * Reuse `adapter.previewRows(config, table, limit)` yang SUDAH ada di
   * SETIAP driver (registry.js, Fase 0) — bukan endpoint baru per driver.
   * Bedanya cuma limit-nya dinaikkan ke MAX_ROWS (bukan limit kecil ala
   * pratinjau UI). Kontrak adapter SERAGAM di semua 16 driver: kembalikan
   * `{ columns: string[], rows: object[] }` — lihat catatan tier di
   * registry.js soal batasan jujur tier document/graph/kv/vector.
   */
  async importTable({ connectionId, sourceTable, name }, user = null) {
    if (!sourceTable || typeof sourceTable !== "string") throw new Error("Nama tabel sumber wajib diisi.");
    const { doc, adapter, fullConfig } = connectionsService.getRuntime(connectionId);

    const result = await adapter.previewRows(fullConfig, sourceTable, MAX_ROWS);
    const columns = result?.columns || [];
    const rawRows = result?.rows || [];
    if (columns.length === 0) throw new Error("Tabel/koleksi sumber tidak punya kolom (kosong atau tidak ditemukan).");
    if (columns.length > MAX_COLS) throw new Error(`Kolom terlalu banyak (maks ${MAX_COLS})`);

    // Adapter mengembalikan rows sebagai ARRAY OF OBJECT (keyed nama kolom).
    // tableImport.inferTypes/sanitizeCell dibuat untuk array-of-array
    // (kontrak yang sama dipakai upload dari hasil parse CSV/Excel) — jadi
    // di sini disejajarkan dulu ke urutan `columns`.
    const rows = rawRows.map((r) => columns.map((c) => (r ? r[c] : null)));

    const safeCols = uniqueCols(columns);
    const types = inferTypes(safeCols, rows);

    const displayName = String(name || sourceTable).trim().slice(0, 120) || sourceTable;
    const slug = safeIdent(displayName, "data").slice(0, 8);
    const tableName = `${PREFIX}conn_${slug}_${uniqueTableSuffix()}`.slice(0, ID_MAX);

    const ddl = `CREATE TABLE ${tableRef(tableName)} (${safeCols.map((c, i) => colDDL(c, types[i])).join(", ")})`;
    await db.exec(ddl);

    if (rows.length) {
      const placeholders = safeCols.map(() => "?").join(", ");
      const sql = `INSERT INTO ${tableRef(tableName)} (${safeCols.map(ident).join(", ")}) VALUES (${placeholders})`;
      const data = rows.map((r) => safeCols.map((_, ci) => sanitizeCell(r[ci], types[ci])));
      await db.execMany(sql, data);
    }

    const meta = {
      id: `connimp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tableName,
      name: displayName,
      columns: safeCols.map((c, i) => ({ name: c, orig: String(columns[i]), type: types[i] })),
      rowCount: rows.length,
      truncated: rows.length >= MAX_ROWS, // heuristik: kena batas MAX_ROWS persis → kemungkinan masih ada sisa di sumber
      connectionId: doc.id,
      connectionName: doc.nama,
      driver: doc.driver,
      sourceTable,
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
    const meta = all.find((m) => m.id === id);
    if (!meta) return false;
    if (!canManageItem(meta, user))
      throw new Error("Hanya pembuat atau admin yang boleh menghapus tabel ini");
    try { await db.exec(`DROP TABLE ${tableRef(meta.tableName)}`); } catch { /* tabel mungkin sudah hilang */ }
    metaStore.writeAll(COLLECTION, all.filter((m) => m.id !== id));
    return true;
  },

  setSharedWith(id, nips, user = null) {
    const all = metaStore.readAll(COLLECTION);
    const meta = all.find((m) => m.id === id);
    if (!meta) throw new Error("Tabel tidak ditemukan");
    if (!canManageItem(meta, user))
      throw new Error("Hanya pembuat atau admin yang boleh membagikan tabel ini");
    meta.sharedWith = sanitizeSharedWith(nips);
    metaStore.writeAll(COLLECTION, all);
    return meta;
  },
};

export default connImportsService;
