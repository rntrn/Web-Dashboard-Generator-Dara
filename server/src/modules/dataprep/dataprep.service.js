/**
 * dataprep.service.js — Data Preparation Fase 2: recipe engine.
 *
 * Beda dari Data Connection Fase 1 (connImports.service.js, yang menarik
 * data dari LUAR DARA): modul ini mengolah data yang SUDAH ada di database
 * DARA sendiri (tabel apa pun berawalan `dara_data_*` — upload, hasil
 * import koneksi, atau tabel contoh) — pilih kolom, ganti nama, ubah tipe
 * num/text, gabung (JOIN) dengan satu tabel lain, filter baris (WHERE),
 * lalu simpan hasilnya sebagai tabel BARU `dara_data_prep_*`.
 *
 * FILTER BARIS: `recipe.filters` = array `{table, column, op, value}`,
 * digabung dengan AND saja (belum ada OR/grouping — cukup untuk kasus
 * umum, lihat FILTER_OPS untuk daftar operator). Nilai filter SELALU
 * lewat placeholder SQL "?" (params terpisah dari selectSql), TIDAK
 * PERNAH ditempel langsung ke teks query — beda dari nama tabel/kolom
 * yang jadi IDENTIFIER (perlu whitelist skema), nilai filter jadi DATA
 * biasa jadi cukup parameter binding standar.
 *
 * Karena sumber & tujuannya SATU database yang sama, tidak perlu tarik
 * baris ke memori JS dulu (beda dari connImports.service.js) — cukup satu
 * `CREATE TABLE ... AS SELECT ...` (CTAS), didukung MySQL maupun SQLite.
 * "Preview" = query SELECT yang SAMA, tinggal ditambah LIMIT kecil, belum
 * membuat tabel apa pun.
 *
 * KEAMANAN — PENTING: `recipe` datang dari body request (JSON), dan nama
 * tabel/kolom di dalamnya dipakai langsung sebagai IDENTIFIER SQL (lewat
 * ident()/tableRef() di dialect.js). Setiap nama tabel/kolom di recipe
 * WAJIB divalidasi dulu terhadap skema sungguhan (databasesRepository) di
 * compileRecipe() SEBELUM dipakai membangun SQL — kalau tidak, ini jadi
 * SQL injection lewat identifier. JANGAN skip validasi ini walau terasa
 * berulang.
 *
 * AKSES: memicu preview/save (dataprep.routes.js) admin-only — sama
 * seperti Data Connection, karena bisa menyentuh tabel privat pengguna
 * lain (mis. hasil upload orang lain). Mengelola tabel HASIL-nya
 * (dataprepTables.routes.js, `/api/dataprep-tables`) cuma butuh login
 * biasa, ter-ACL per-item — pola identik uploads/connImports.
 */

import Database from "../../config/database.js";
import { metaStore } from "../../config/metaStore.js";
import { canManageItem, sanitizeSharedWith } from "../../lib/acl.js";
import { ident, tableRef, castExpr } from "../../lib/dialect.js";
import { ID_MAX, safeIdent, uniqueCols, uniqueTableSuffix } from "../../lib/tableImport.js";
import { databasesRepository } from "../databases/databases.repository.js";

function canAccessPrep(meta, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (meta.createdBy && meta.createdBy.nip === user.nip) return true;
  return !!(Array.isArray(meta.sharedWith) && meta.sharedWith.includes(user.nip));
}

const db = new Database();
const COLLECTION = "dataprep";
const PREFIX = (process.env.DB_TABLE_PREFIX || "dara_data_");
const MAX_ROWS = 100000;     // sama seperti batas upload/import — konsisten satu batas di seluruh DARA
const PREVIEW_LIMIT = 50;
const MAX_COLUMNS = 100;
const MAX_FILTERS = 20;

// Whitelist operator filter → fragmen SQL. Kunci ("eq", "gt", dst) yang
// dikirim client, BUKAN teks SQL bebas — jadi tidak ada celah injeksi lewat
// operator. Nilai filter SELALU dikirim lewat placeholder "?" (params),
// tidak pernah ditempel langsung ke teks SQL.
const FILTER_OPS = {
  eq: "=", neq: "!=", gt: ">", lt: "<", gte: ">=", lte: "<=",
  contains: "LIKE", not_contains: "NOT LIKE",
  is_null: "IS NULL", is_not_null: "IS NOT NULL",
};
const FILTER_OPS_NO_VALUE = new Set(["is_null", "is_not_null"]);

/**
 * Validasi recipe terhadap skema SUNGGUHAN, lalu rakit jadi SQL SELECT.
 * Melempar Error (pesan aman ditampilkan ke user) kalau ada nama
 * tabel/kolom yang tidak dikenal — lihat catatan KEAMANAN di atas berkas.
 */
async function compileRecipe(recipe) {
  const allTables = await databasesRepository.getTables();
  const tableByUpper = new Map(allTables.map((t) => [t.toUpperCase(), t]));

  const srcReal = tableByUpper.get(String(recipe?.sourceTable || "").toUpperCase());
  if (!srcReal) throw new Error("Tabel sumber tidak ditemukan.");
  const srcCols = await databasesRepository.getTableInfo(srcReal);
  const srcColSet = new Set(srcCols.map((c) => c.name.toUpperCase()));

  let joinReal = null;
  let joinColSet = null;
  if (recipe.join && recipe.join.table) {
    joinReal = tableByUpper.get(String(recipe.join.table).toUpperCase());
    if (!joinReal) throw new Error("Tabel gabungan (JOIN) tidak ditemukan.");
    const joinCols = await databasesRepository.getTableInfo(joinReal);
    joinColSet = new Set(joinCols.map((c) => c.name.toUpperCase()));
    const on = recipe.join.on || {};
    if (!on.leftColumn || !on.rightColumn) throw new Error("Kolom penghubung JOIN wajib diisi.");
    if (!srcColSet.has(String(on.leftColumn).toUpperCase())) throw new Error(`Kolom "${on.leftColumn}" tidak ada di tabel sumber.`);
    if (!joinColSet.has(String(on.rightColumn).toUpperCase())) throw new Error(`Kolom "${on.rightColumn}" tidak ada di tabel gabungan.`);
  }

  const cols = Array.isArray(recipe.columns) ? recipe.columns : [];
  if (cols.length === 0) throw new Error("Pilih minimal satu kolom.");
  if (cols.length > MAX_COLUMNS) throw new Error(`Kolom terlalu banyak (maks ${MAX_COLUMNS}).`);

  const aliasNames = uniqueCols(cols.map((c, i) => c.as || c.column || `kol${i + 1}`));

  const selectParts = cols.map((c, i) => {
    const fromJoin = c.table === "join";
    if (fromJoin) {
      if (!joinReal) throw new Error("Ada kolom menunjuk tabel JOIN, tapi JOIN belum diatur.");
      if (!joinColSet.has(String(c.column).toUpperCase())) throw new Error(`Kolom "${c.column}" tidak ada di tabel gabungan.`);
    } else if (!srcColSet.has(String(c.column).toUpperCase())) {
      throw new Error(`Kolom "${c.column}" tidak ada di tabel sumber.`);
    }
    const alias = fromJoin ? "t2" : "t1";
    let expr = `${alias}.${ident(c.column, db.dbType)}`;
    if (c.type === "num" || c.type === "text") expr = castExpr(expr, c.type, db.dbType);
    return `${expr} AS ${ident(aliasNames[i], db.dbType)}`;
  });

  let from = `${tableRef(srcReal, db.dbType)} t1`;
  if (joinReal) {
    const kataJoin = recipe.join.type === "INNER" ? "JOIN" : "LEFT JOIN";
    from += ` ${kataJoin} ${tableRef(joinReal, db.dbType)} t2 ON t1.${ident(recipe.join.on.leftColumn, db.dbType)} = t2.${ident(recipe.join.on.rightColumn, db.dbType)}`;
  }

  // Filter baris (WHERE ... AND ...). Nama kolom divalidasi sama seperti
  // kolom SELECT di atas; operator dari whitelist FILTER_OPS; nilai SELALU
  // lewat placeholder "?" (params) — tidak pernah string-interpolated.
  const filters = Array.isArray(recipe.filters) ? recipe.filters : [];
  if (filters.length > MAX_FILTERS) throw new Error(`Filter terlalu banyak (maks ${MAX_FILTERS}).`);
  const params = [];
  const whereParts = filters.map((f) => {
    const fromJoin = f.table === "join";
    if (fromJoin) {
      if (!joinReal) throw new Error("Ada filter menunjuk tabel JOIN, tapi JOIN belum diatur.");
      if (!joinColSet.has(String(f.column).toUpperCase())) throw new Error(`Kolom filter "${f.column}" tidak ada di tabel gabungan.`);
    } else if (!srcColSet.has(String(f.column).toUpperCase())) {
      throw new Error(`Kolom filter "${f.column}" tidak ada di tabel sumber.`);
    }
    const sqlOp = FILTER_OPS[f.op];
    if (!sqlOp) throw new Error(`Operator filter "${f.op}" tidak dikenal.`);
    const alias = fromJoin ? "t2" : "t1";
    const colExpr = `${alias}.${ident(f.column, db.dbType)}`;
    if (FILTER_OPS_NO_VALUE.has(f.op)) return `${colExpr} ${sqlOp}`;
    if (f.value === "" || f.value == null) throw new Error(`Isi nilai untuk filter kolom "${f.column}".`);
    params.push(f.op === "contains" || f.op === "not_contains" ? `%${f.value}%` : f.value);
    return `${colExpr} ${sqlOp} ?`;
  });
  const where = whereParts.length ? ` WHERE ${whereParts.join(" AND ")}` : "";

  return {
    selectSql: `SELECT ${selectParts.join(", ")} FROM ${from}${where}`,
    params,
    outputColumns: aliasNames,
    sourceTable: srcReal,
    joinTable: joinReal,
  };
}

export const dataprepService = {
  list(user = null) {
    const all = metaStore.readAll(COLLECTION);
    return user ? all.filter((m) => canAccessPrep(m, user)) : all;
  },

  /** Boleh akses tabel ini? (tabel global = ya; tabel hasil Data Prep = selalu privat). */
  canAccessTable(tableName, user) {
    const meta = metaStore.readAll(COLLECTION).find(
      (m) => m.tableName.toUpperCase() === String(tableName).toUpperCase());
    if (!meta) return true;
    return canAccessPrep(meta, user);
  },

  /** Pratinjau (belum membuat tabel apa pun) — SELECT ... LIMIT kecil. */
  async preview(recipe) {
    const { selectSql, params, outputColumns } = await compileRecipe(recipe);
    const rows = await db.query(`${selectSql} LIMIT ${PREVIEW_LIMIT}`, params);
    return { columns: outputColumns, rows };
  },

  /**
   * Simpan recipe sebagai tabel baru `dara_data_prep_*` (CREATE TABLE ... AS SELECT).
   * `rowLimit` opsional dari UI (preset 1rb/10rb/50rb/100rb) — DIJEPIT ke
   * [1, MAX_ROWS], jadi walau client kirim angka aneh, batas keras tetap
   * MAX_ROWS (lindungi memori/disk server, sama filosofi upload/import).
   */
  async save({ recipe, name, rowLimit }, user = null) {
    const { selectSql, params, outputColumns, sourceTable, joinTable } = await compileRecipe(recipe);

    const displayName = String(name || sourceTable).trim().slice(0, 120) || sourceTable;
    const slug = safeIdent(displayName, "data").slice(0, 8);
    const tableName = `${PREFIX}prep_${slug}_${uniqueTableSuffix()}`.slice(0, ID_MAX);
    const limit = Math.min(Math.max(1, Number(rowLimit) || MAX_ROWS), MAX_ROWS);

    await db.exec(`CREATE TABLE ${tableRef(tableName, db.dbType)} AS ${selectSql} LIMIT ${limit}`, params);
    const countRow = await db.queryOne(`SELECT COUNT(*) AS n FROM ${tableRef(tableName, db.dbType)}`);
    const rowCount = countRow ? Number(countRow.n) : 0;

    const meta = {
      id: `prep_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tableName,
      name: displayName,
      sourceTable,
      joinTable,
      columns: outputColumns,
      rowCount,
      rowLimit: limit,
      truncated: rowCount >= limit,
      recipe, // disimpan utuh untuk transparansi/audit — belum bisa "jalankan ulang" otomatis (itu Fase 3)
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
    try { await db.exec(`DROP TABLE ${tableRef(meta.tableName, db.dbType)}`); } catch { /* tabel mungkin sudah hilang */ }
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

export default dataprepService;
