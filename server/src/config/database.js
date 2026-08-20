/**
 * Database Abstraction Layer — multi-driver (DARA FREE).
 *
 * Dua driver yang didukung:
 *   - "mysql"  : mysql2/promise (REKOMENDASI, dipakai installer)
 *   - "sqlite" : sql.js — SQLite murni JS, tanpa build tools. Untuk coba cepat
 *                tanpa memasang server database.
 *
 * (Driver Oracle sengaja DIHAPUS di versi free.)
 *
 * API seragam untuk kedua driver:
 *   await db.init()
 *   await db.query(sql, params)     -> Array<Object>
 *   await db.queryOne(sql, params)  -> Object | null
 *   await db.exec(sql, params)      -> { changes }
 *   await db.execMany(sql, rows)    -> { changes }
 *   await db.close()
 *
 * Konvensi placeholder: SELALU pakai "?" di semua query. MySQL dan SQLite
 * sama-sama memakai "?", jadi tidak ada penerjemahan.
 *
 * Env yang dibaca:
 *   DB_TYPE           mysql | sqlite            (default: mysql)
 *   DB_TABLE_PREFIX   filter nama tabel yang ditampilkan (default dara_data_)
 *   MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE
 *   MYSQL_POOL_MAX    jumlah koneksi maksimum (default 10)
 *   DB_PATH           (sqlite) path file .db
 */

import fs from "fs";

let SQL = null;      // instance sql.js (dibuat sekali per proses)
let mysql = null;    // modul mysql2/promise, di-load lazy
let sharedPool = null; // satu pool untuk seluruh proses (jangan per-instance)

/**
 * SQLite (sql.js) satu database-in-memory DIBAGI untuk seluruh proses,
 * dikunci per dbPath — sama seperti sharedPool di atas untuk MySQL.
 *
 * KENAPA INI PENTING: setiap modul (uploads, connImports, dataprep,
 * databases, ...) membuat `new Database()` sendiri-sendiri. Sebelum
 * perbaikan ini, tiap instance punya salinan in-memory sql.js miliknya
 * SENDIRI yang dimuat lazy dari file .db saat query PERTAMA dijalankan
 * pada instance itu. Akibatnya: modul A menulis tabel baru (mis. hasil
 * CREATE TABLE ... AS SELECT di dataprep.service.js) lalu modul B (mis.
 * databases.repository.js) yang instance-nya SUDAH lebih dulu terpakai
 * untuk query lain, tidak pernah melihat tabel baru itu sampai proses
 * di-restart — walau file .db di disk sudah benar. Ini terbukti nyata
 * (bukan cuma teori) saat pengujian end-to-end Data Preparation Fase 2:
 * compileRecipe() di dataprep.service.js memanggil databasesRepository
 * untuk validasi SEBELUM CREATE TABLE dijalankan, yang otomatis membuat
 * instance databases.repository.js "terkunci" ke snapshot lama — 100%
 * reproducible, bukan kebetulan timing.
 *
 * Dengan satu objek sql.js Database dibagi semua instance (dikunci per
 * dbPath, bukan cuma global, untuk jaga-jaga ada dbPath berbeda), semua
 * modul langsung melihat tulisan modul lain karena memegang REFERENSI
 * objek yang sama. Ini juga otomatis meniadakan kejanggalan serupa yang
 * sudah pernah ditemukan sebelumnya (baris muncul lagi sesaat setelah
 * DROP TABLE, di Data Connection Fase 1).
 *
 * Catatan mode produksi: MySQL TIDAK terkena isu ini sama sekali (satu
 * connection pool yang selalu query langsung ke server, tidak ada
 * snapshot di memori) — perbaikan ini murni untuk mode SQLite (uji
 * coba cepat tanpa server database).
 */
const sharedSqliteDbs = new Map(); // dbPath -> instance sql.js Database

/**
 * Daftarkan fungsi agregat statistik kustom pada sebuah instance sql.js.
 * SQLite tak punya MEDIAN/PERCENTILE bawaan, jadi kita sediakan:
 *   - MED(x)     : nilai tengah (median)
 *   - PCT(x, p)  : persentil ke-p (0..1), interpolasi linear
 * MySQL 8 tidak punya MEDIAN bawaan juga; lihat lib/aggExpr.js untuk
 * padanannya. Diekspor agar bisa diuji terpisah.
 */
export function registerSqliteAggregates(sqljsDb) {
  sqljsDb.create_aggregate("MED", {
    init: () => [],
    step: (acc, v) => { if (v != null) acc.push(Number(v)); return acc; },
    finalize: (acc) => {
      if (!acc.length) return null;
      acc.sort((a, b) => a - b);
      const m = Math.floor(acc.length / 2);
      return acc.length % 2 ? acc[m] : (acc[m - 1] + acc[m]) / 2;
    },
  });
  sqljsDb.create_aggregate("PCT", {
    init: () => ({ vals: [], p: 0.5 }),
    step: (acc, v, p) => {
      if (v != null) acc.vals.push(Number(v));
      if (p != null) acc.p = Number(p);
      return acc;
    },
    finalize: (acc) => {
      const a = acc.vals;
      if (!a.length) return null;
      a.sort((x, y) => x - y);
      const idx = (a.length - 1) * acc.p;
      const lo = Math.floor(idx), hi = Math.ceil(idx);
      return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (idx - lo);
    },
  });
}

export class Database {
  constructor() {
    this.dbType = (process.env.DB_TYPE || "mysql").toLowerCase();
    this.dbPath = process.env.DB_PATH || "./dara.db";
    this.tablePrefix = process.env.DB_TABLE_PREFIX || "dara_data_";
    this.db = null; // sql.js database
  }

  async init() {
    if (this.dbType === "mysql") return this._initMysql();
    return this._initSqlite();
  }

  // ---------- MySQL ----------

  /**
   * Pool dibagi satu proses. mysql2 sudah antre permintaan sendiri, jadi
   * membuat Database baru di banyak modul tidak menambah koneksi.
   */
  async _initMysql() {
    if (sharedPool) return sharedPool;
    if (!mysql) mysql = (await import("mysql2/promise")).default;

    sharedPool = mysql.createPool({
      host: process.env.MYSQL_HOST || "127.0.0.1",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "dara_free",
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_POOL_MAX || 10),
      queueLimit: 0,
      charset: "utf8mb4_unicode_ci",
      // Angka DECIMAL/BIGINT dikembalikan sebagai string oleh driver.
      // DARA menghitung agregat di sisi SQL lalu menampilkannya sebagai angka,
      // jadi kita minta driver mengubahnya ke Number supaya chart tidak
      // menerima string. BIGINT di luar rentang aman JS tetap string.
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      dateStrings: true, // DATE/DATETIME jadi string "YYYY-MM-DD HH:mm:ss"
    });
    return sharedPool;
  }

  // ---------- SQLite (sql.js) ----------

  async _initSqlite() {
    if (!SQL) {
      const initSqlJs = (await import("sql.js")).default;
      SQL = await initSqlJs();
    }
    if (sharedSqliteDbs.has(this.dbPath)) {
      // Pakai objek yang SAMA dengan instance lain yang sudah lebih dulu
      // membuka dbPath ini di proses ini — lihat catatan sharedSqliteDbs.
      this.db = sharedSqliteDbs.get(this.dbPath);
      return;
    }
    const sqljsDb = fs.existsSync(this.dbPath)
      ? new SQL.Database(fs.readFileSync(this.dbPath))
      : new SQL.Database();
    sqljsDb.run("PRAGMA foreign_keys = ON");
    registerSqliteAggregates(sqljsDb);
    sharedSqliteDbs.set(this.dbPath, sqljsDb);
    this.db = sqljsDb;
  }

  // ---------- API seragam ----------

  async query(sql, params = []) {
    if (this.dbType === "mysql") {
      const pool = await this._initMysql();
      try {
        const [rows] = await pool.query(sql, params);
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        throw new Error(`MySQL query failed: ${err.message}`);
      }
    }

    if (!this.db) await this._initSqlite();
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    } catch (err) {
      throw new Error(`Query failed: ${err.message}`);
    }
  }

  async queryOne(sql, params = []) {
    const rows = await this.query(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async exec(sql, params = []) {
    if (this.dbType === "mysql") {
      const pool = await this._initMysql();
      try {
        const [res] = await pool.query(sql, params);
        return { changes: res.affectedRows ?? 0, insertId: res.insertId ?? null };
      } catch (err) {
        throw new Error(`MySQL exec failed: ${err.message}`);
      }
    }

    if (!this.db) await this._initSqlite();
    try {
      this.db.run(sql, params);
      this.save();
      return { changes: this.db.getRowsModified() };
    } catch (err) {
      throw new Error(`Exec failed: ${err.message}`);
    }
  }

  /**
   * INSERT massal. `rows` = array of array param (positional, cocok "?").
   * MySQL : satu statement `INSERT ... VALUES ?` per batch (jauh lebih cepat
   *         daripada satu round-trip per baris). Dipecah agar tidak menabrak
   *         max_allowed_packet.
   * SQLite: satu prepared statement, simpan file SEKALI di akhir.
   */
  async execMany(sql, rows = [], batchSize = 500) {
    if (rows.length === 0) return { changes: 0 };

    if (this.dbType === "mysql") {
      const pool = await this._initMysql();
      // Ubah "INSERT INTO t (a,b) VALUES (?,?)" → "... VALUES ?" (bulk mysql2)
      const bulkSql = sql.replace(/VALUES\s*\([^)]*\)\s*$/i, "VALUES ?");
      let changes = 0;
      try {
        for (let i = 0; i < rows.length; i += batchSize) {
          const chunk = rows.slice(i, i + batchSize);
          const [res] = await pool.query(bulkSql, [chunk]);
          changes += res.affectedRows ?? chunk.length;
        }
        return { changes };
      } catch (err) {
        throw new Error(`MySQL execMany failed: ${err.message}`);
      }
    }

    if (!this.db) await this._initSqlite();
    try {
      const stmt = this.db.prepare(sql);
      for (const r of rows) { stmt.bind(r); stmt.step(); stmt.reset(); }
      stmt.free();
      this.save();
      return { changes: rows.length };
    } catch (err) {
      throw new Error(`execMany failed: ${err.message}`);
    }
  }

  /**
   * Jalankan beberapa perintah dalam SATU transaksi.
   * Callback menerima objek dengan `.exec(sql, params)` dan `.execMany(sql, rows)`
   * yang memakai koneksi yang sama.
   *
   * SQLite (sql.js) berjalan di memori satu berkas — transaksi eksplisit tidak
   * memberi jaminan tambahan di sini, jadi callback dijalankan apa adanya.
   */
  async withTransaction(fn) {
    if (this.dbType !== "mysql") {
      return fn({
        exec: (sql, params) => this.exec(sql, params),
        execMany: (sql, rows) => this.execMany(sql, rows),
      });
    }

    const pool = await this._initMysql();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn({
        exec: async (sql, params = []) => {
          const [res] = await conn.query(sql, params);
          return { changes: res.affectedRows ?? 0, insertId: res.insertId ?? null };
        },
        execMany: async (sql, rows = [], batchSize = 500) => {
          if (rows.length === 0) return { changes: 0 };
          const bulkSql = sql.replace(/VALUES\s*\([^)]*\)\s*$/i, "VALUES ?");
          let changes = 0;
          for (let i = 0; i < rows.length; i += batchSize) {
            const chunk = rows.slice(i, i + batchSize);
            const [res] = await conn.query(bulkSql, [chunk]);
            changes += res.affectedRows ?? chunk.length;
          }
          return { changes };
        },
      });
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Simpan file SQLite ke disk (MySQL tidak perlu). */
  save() {
    if (this.dbType !== "sqlite" || !this.db) return;
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }

  async close() {
    if (this.dbType === "mysql") {
      if (sharedPool) { await sharedPool.end(); sharedPool = null; }
      return;
    }
    if (this.db) {
      this.save();
      this.db.close();
      sharedSqliteDbs.delete(this.dbPath); // instance lain jangan pegang objek yang sudah ditutup
      this.db = null;
    }
  }
}

export default Database;
