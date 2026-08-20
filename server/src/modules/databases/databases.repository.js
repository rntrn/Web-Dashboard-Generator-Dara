/**
 * Database Schema Introspection Repository
 *
 * Mendukung dua driver (lihat config/database.js): mysql & sqlite.
 * Query introspeksi berbeda per driver, jadi ada percabangan `db.dbType`.
 *
 * Fitur prefix: bila env DB_TABLE_PREFIX di-set (default "dara_data_"), hanya
 * tabel berawalan itu yang ditampilkan. Ini yang menjaga tabel metadata
 * (dara_charts, ...) tidak ikut muncul di menu Jelajah Data.
 *
 * KOLOM SENSITIF: `dara_data_pegawai` menyimpan kolom `password_hash` (lihat
 * db/schema/002_sample_tables.sql) karena tabel itu juga jadi identitas
 * pengguna aplikasi. Supaya kolom ini TIDAK PERNAH bisa dipilih sebagai
 * dimensi/measure di Chart Builder atau muncul di Jelajah Data/contoh data,
 * ia disaring di SATU tempat di sini (getTableInfo & getSampleData). Modul
 * suggestions/charts memvalidasi kolom yang diminta terhadap hasil
 * getTableInfo(), jadi menyaringnya di sini otomatis melindungi semua jalur.
 */

import Database from "../../config/database.js";
import { ident } from "../../lib/dialect.js";

const db = new Database();

/** Nama kolom (huruf kecil) yang tidak boleh pernah terekspos lewat API data. */
const BLOCKED_COLUMNS = new Set(["password_hash"]);

/**
 * Bangun pola LIKE untuk prefix dengan meng-escape karakter '_' dan '%'
 * (karena keduanya wildcard di SQL LIKE). Dipakai bersama ESCAPE '\'.
 */
function prefixLikePattern(prefix) {
  const escaped = prefix.replace(/[\\_%]/g, (ch) => "\\" + ch);
  return escaped + "%";
}

export const databasesRepository = {
  /** Daftar tabel (terfilter prefix bila di-set). */
  async getTables() {
    const prefix = db.tablePrefix;

    if (db.dbType === "mysql") {
      // DATABASE() = database aktif pada koneksi, jadi tidak perlu env tambahan.
      const base = `SELECT table_name AS name
                    FROM information_schema.tables
                    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`;
      if (prefix) {
        const rows = await db.query(
          `${base} AND table_name LIKE ? ESCAPE '\\\\' ORDER BY table_name`,
          [prefixLikePattern(prefix)]
        );
        return rows.map((r) => r.name);
      }
      // Tanpa prefix: tetap sembunyikan tabel metadata DARA sendiri.
      const rows = await db.query(
        `${base} AND table_name NOT LIKE 'dara\\\\_%' ESCAPE '\\\\' ORDER BY table_name`
      );
      return rows.map((r) => r.name);
    }

    // sqlite
    if (prefix) {
      const rows = await db.query(
        `SELECT name FROM sqlite_master
         WHERE type='table' AND name LIKE ? ESCAPE '\\'
         ORDER BY name`,
        [prefixLikePattern(prefix)]
      );
      return rows.map((r) => r.name);
    }
    const rows = await db.query(
      `SELECT name FROM sqlite_master
       WHERE type='table'
         AND name NOT LIKE '\\_%' ESCAPE '\\'
         AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
       ORDER BY name`
    );
    return rows.map((r) => r.name);
  },

  /** Jumlah baris tabel. */
  async getTableRowCount(tableName) {
    const row = await db.queryOne(
      `SELECT COUNT(*) AS n FROM ${ident(tableName, db.dbType)}`
    );
    return row ? Number(row.n) : 0;
  },

  /** Info kolom seragam: { name, type, nullable, pk, fk }. */
  async getTableInfo(tableName) {
    if (db.dbType === "mysql") {
      const rows = await db.query(
        `SELECT c.column_name  AS name,
                c.data_type    AS type,
                c.is_nullable  AS nullable,
                c.column_key   AS ckey,
                k.referenced_table_name  AS ref_table,
                k.referenced_column_name AS ref_column
         FROM information_schema.columns c
         LEFT JOIN information_schema.key_column_usage k
                ON k.table_schema = c.table_schema
               AND k.table_name   = c.table_name
               AND k.column_name  = c.column_name
               AND k.referenced_table_name IS NOT NULL
         WHERE c.table_schema = DATABASE() AND c.table_name = ?
         ORDER BY c.ordinal_position`,
        [tableName]
      );
      return rows
        .filter((c) => !BLOCKED_COLUMNS.has(String(c.name).toLowerCase()))
        .map((c) => ({
          name: c.name,
          type: String(c.type || "").toUpperCase(),
          nullable: c.nullable === "YES",
          pk: c.ckey === "PRI",
          fk: c.ref_table ? { table: c.ref_table, column: c.ref_column } : null,
        }));
    }

    // sqlite
    const info = await db.query(`PRAGMA table_info("${tableName}")`);
    return info
      .filter((col) => !BLOCKED_COLUMNS.has(String(col.name).toLowerCase()))
      .map((col) => ({
        name: col.name,
        type: col.type,
        nullable: col.notnull === 0,
        pk: col.pk === 1,
        fk: null,
      }));
  },

  /** Contoh data (dibatasi limit baris). Kolom sensitif ikut disaring. */
  async getSampleData(tableName, limit = 100) {
    // LIMIT ? tidak diterima MySQL pada mode prepared statement tertentu,
    // jadi angkanya di-cast ke integer dan disisipkan langsung (aman: bukan
    // input bebas, sudah dipaksa jadi bilangan bulat).
    const n = Math.max(1, Math.min(10000, parseInt(limit, 10) || 100));
    const rows = await db.query(`SELECT * FROM ${ident(tableName, db.dbType)} LIMIT ${n}`);
    if (rows.length === 0 || BLOCKED_COLUMNS.size === 0) return rows;
    return rows.map((r) => {
      const clean = { ...r };
      for (const col of Object.keys(clean)) {
        if (BLOCKED_COLUMNS.has(col.toLowerCase())) delete clean[col];
      }
      return clean;
    });
  },

  /** Statistik ringkas tabel. */
  async getTableStats(tableName) {
    const rowCount = await this.getTableRowCount(tableName);
    const columns = await this.getTableInfo(tableName);
    return { tableName, rowCount, columnCount: columns.length, columns };
  },
};

export default databasesRepository;
