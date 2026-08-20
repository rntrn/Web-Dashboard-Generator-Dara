/**
 * Suggestions Repository
 * Mengambil statistik kolom (tipe, cardinality) + data agregasi untuk chart.
 * Driver-aware lewat lib/dialect.js: MySQL memakai backtick, SQLite memakai
 * kutip ganda. Selebihnya (GROUP BY, ORDER BY, LIMIT) sintaksnya sama.
 */

import Database from "../../config/database.js";
import { databasesRepository } from "../databases/databases.repository.js";
import { buildFilterClause } from "../../lib/filterSql.js";
import { aggExpr } from "../../lib/aggExpr.js";
import { dateGrainExpr } from "../../lib/dateGrain.js";
import { buildCalcSql } from "../../lib/calcExpr.js";
import { ident as quoteIdent } from "../../lib/dialect.js";

const db = new Database();

/** Tipe kolom yang dianggap numerik (MySQL & SQLite). */
const NUMERIC_TYPES = ["INT", "REAL", "NUMER", "DECIMAL", "FLOAT", "DOUBLE", "NUMBER"];

export function isNumericType(type) {
  if (!type) return false;
  const t = type.toUpperCase();
  return NUMERIC_TYPES.some((n) => t.includes(n));
}

export function isTemporal(name, type) {
  const t = (type || "").toUpperCase();
  if (t.includes("DATE") || t.includes("TIME")) return true;
  const n = (name || "").toLowerCase();
  return n.includes("date") || n.includes("_at") || n === "tanggal";
}

/** Quote identifier kolom sesuai driver aktif. */
const ident = (name) => quoteIdent(name, db.dbType);

/** Quote nama tabel sesuai driver aktif. */
const tableRef = (name) => quoteIdent(name, db.dbType);

/**
 * Pastikan nama kolom yang diminta klien benar-benar ada di tabel (hasil
 * getTableInfo, yang sudah menyaring kolom sensitif seperti password_hash).
 * ident() hanya mengutip identifier (cegah SQL injection) — TIDAK mencegah
 * memilih kolom yang memang ada tapi seharusnya tak boleh dibaca lewat API
 * data generik. Validasi keanggotaan ini yang menutup celah itu.
 * @throws {Error} bila kolom tak ditemukan di daftar yang diizinkan
 */
function assertColumnAllowed(colName, allowedNames, label = "Kolom") {
  if (!colName) return;
  const ok = allowedNames.some((n) => n.toLowerCase() === String(colName).toLowerCase());
  if (!ok) throw new Error(`${label} "${colName}" tidak dikenali pada tabel ini`);
}

export const suggestionsRepository = {
  /** Kolom tabel (delegasi ke databasesRepository yang sudah driver-aware). */
  async getColumns(tableName) {
    const info = await databasesRepository.getTableInfo(tableName);
    return info.map((c) => ({ name: c.name, type: c.type, pk: c.pk }));
  },

  /** Jumlah nilai unik pada satu kolom. */
  async getDistinctCount(tableName, column) {
    const row = await db.queryOne(
      `SELECT COUNT(DISTINCT ${ident(column)}) AS n FROM ${tableRef(tableName)}`
    );
    return row ? Number(row.n) : 0;
  },

  /** Total baris tabel (delegasi). */
  async getRowCount(tableName) {
    return databasesRepository.getTableRowCount(tableName);
  },

  /** Nilai distinct sebuah kolom (untuk dropdown slicer), maks 50.
   *  ORDER BY 1 (posisional) supaya aman dgn DISTINCT di semua database.
   *  `filters` (opsional) = filter slicer LAIN yang aktif → opsi jadi cascading
   *  (hanya nilai yang masih ada setelah filter lain diterapkan). */
  async getDistinctValues(tableName, column, filters = []) {
    const cols = await databasesRepository.getTableInfo(tableName);
    assertColumnAllowed(column, cols.map((c) => c.name), "Kolom");

    let where = "", params = [];
    if (filters && filters.length) {
      const colSet = new Set(cols.map((c) => c.name.toUpperCase()));
      ({ where, params } = buildFilterClause(filters, colSet, { dbType: db.dbType, ident }));
    }
    const rows = await db.query(
      `SELECT DISTINCT ${ident(column)} AS value FROM ${tableRef(tableName)}
       ${where} ORDER BY 1 LIMIT 50`,
      params
    );
    return rows.map((r) => r.value);
  },

  /**
   * Agregasi data chart. Membangun ekspresi nilai sesuai driver.
   * @param {object} opts { dimension, measure, aggregation, sortBy }
   *   sortBy: "label" -> urut dimensi naik (untuk tren waktu / line)
   *           "value" -> urut nilai turun (untuk bar/pie), default
   */
  async aggregate(tableName, { dimension, measure, aggregation, sortBy = "value" }) {
    const cols = await databasesRepository.getTableInfo(tableName);
    const names = cols.map((c) => c.name);
    assertColumnAllowed(dimension, names, "Dimensi");
    assertColumnAllowed(measure, names, "Measure");

    const valueExpr = aggExpr(aggregation, measure ? ident(measure) : null, db.dbType);

    // Line chart harus kronologis (dimensi naik); lainnya urut nilai terbesar.
    const orderClause =
      sortBy === "label" ? `${ident(dimension)} ASC` : `value DESC`;

    return db.query(
      `SELECT ${ident(dimension)} AS label, ${valueExpr} AS value
       FROM ${tableRef(tableName)}
       GROUP BY ${ident(dimension)}
       ORDER BY ${orderClause}
       LIMIT 50`
    );
  },

  /**
   * Agregasi lintas-tabel (JOIN). Label diambil dari tabel referensi.
   * @param {object} o { table, localKey, joinTable, targetKey, labelColumn,
   *                      measure, aggregation, sortBy }
   */
  async aggregateJoin(o) {
    const { table, localKey, joinTable, targetKey = "id", labelColumn,
            measure, aggregation, sortBy = "value" } = o;

    const [colsT1, colsT2] = await Promise.all([
      databasesRepository.getTableInfo(table),
      databasesRepository.getTableInfo(joinTable),
    ]);
    const namesT1 = colsT1.map((c) => c.name);
    const namesT2 = colsT2.map((c) => c.name);
    assertColumnAllowed(localKey, namesT1, "Kolom relasi");
    assertColumnAllowed(measure, namesT1, "Measure");
    assertColumnAllowed(targetKey, namesT2, "Kolom relasi tujuan");
    assertColumnAllowed(labelColumn, namesT2, "Kolom label");

    const valueExpr = aggExpr(aggregation, measure ? `t1.${ident(measure)}` : null, db.dbType);
    const labelExpr = `t2.${ident(labelColumn)}`;

    const order = sortBy === "label" ? `label ASC` : `value DESC`;
    return db.query(
      `SELECT ${labelExpr} AS label, ${valueExpr} AS value
       FROM ${tableRef(table)} t1
       JOIN ${tableRef(joinTable)} t2 ON t1.${ident(localKey)} = t2.${ident(targetKey)}
       GROUP BY ${labelExpr}
       ORDER BY ${order}
       LIMIT 50`
    );
  },

  /**
   * Agregasi generik multi dimensi/measure (v0.5.0).
   * Hasil baris: { d1, d2?, v1, v2? } — kunci generik agar frontend seragam.
   *
   * @param {object} o
   *   table       - tabel sumber
   *   dims        - array 0..2 nama kolom dimensi. Bila join aktif, dimensi
   *                 PERTAMA otomatis label dari tabel referensi (t2).
   *   measures    - array 0..2 nama kolom numerik (kosong -> COUNT(*))
   *   aggregation - SUM|AVG|COUNT|MIN|MAX (berlaku untuk semua measure)
   *   join        - { table, localKey, targetKey, label } | null
   *   sortBy      - "label" (d1 naik) | "value" (v1 turun, default)
   */
  async aggregateMulti({ table, dims = [], measures = [], aggregation = "SUM", join = null, sortBy = "value", filters = [], dateGrain = null, topN = 0, calcMeasures = [] }) {
    const t1 = (c) => `t1.${ident(c)}`;
    const t2 = (c) => `t2.${ident(c)}`;
    const useJoin = !!(join && join.table);

    // Grain tanggal (R2-4) diterapkan ke dimensi PERTAMA bila ia kolom biasa
    // (bukan label hasil JOIN). Memberi hierarki waktu year/month/day.
    const grainWrap = (expr, i) =>
      (dateGrain && i === 0 && !(useJoin && i === 0))
        ? dateGrainExpr(expr, dateGrain, db.dbType) : expr;

    // WHERE dari slicer (equality / multi-pilih / rentang) — binding aman.
    // Kolom filter berasal dari tabel sumber (t1 saat join).
    const cols = await databasesRepository.getTableInfo(table);
    const colSet = new Set(cols.map((c) => c.name.toUpperCase()));
    const identF = (c) => (useJoin ? t1(c) : ident(c));
    const { where, params: bindParams } = buildFilterClause(filters, colSet, { dbType: db.dbType, ident: identF });

    // Validasi keanggotaan kolom — cegah memilih kolom yang ada tapi
    // seharusnya tak boleh dibaca lewat API generik (mis. password_hash).
    const names = cols.map((c) => c.name);
    let namesT2 = null;
    if (useJoin) {
      const colsT2 = await databasesRepository.getTableInfo(join.table);
      namesT2 = colsT2.map((c) => c.name);
      assertColumnAllowed(join.localKey, names, "Kolom relasi");
      assertColumnAllowed(join.targetKey || "id", namesT2, "Kolom relasi tujuan");
      assertColumnAllowed(join.label, namesT2, "Kolom label");
    }
    dims.forEach((d, i) => {
      if (useJoin && i === 0) return; // dimensi pertama = join.label, sudah divalidasi
      assertColumnAllowed(d, names, "Dimensi");
    });

    // SELECT dimensi -> alias d1, d2
    const dimExprs = dims.map((d, i) => {
      const base = useJoin && i === 0 ? t2(join.label) : (useJoin ? t1(d) : ident(d));
      const expr = grainWrap(base, i);
      return `${expr} AS d${i + 1}`;
    });

    // SELECT measure -> alias v1, v2 (COUNT(*) bila tak ada measure).
    // Calculated field (R2-5): bila ada, measure dibangun dari ekspresi aman
    // (buildCalcSql) — menggantikan measure kolom biasa. Dukung tabel tunggal.
    // buildCalcSql sendiri sudah memvalidasi setiap nama kolom di dalam
    // ekspresi terhadap allowedCols, jadi calc TIDAK perlu assertColumnAllowed
    // terpisah di sini.
    const calc = Array.isArray(calcMeasures) ? calcMeasures.slice(0, 2) : [];
    if (!calc.length) measures.forEach((m) => assertColumnAllowed(m, names, "Measure"));
    const allowedCols = cols.map((c) => c.name);
    const meaSource = calc.length ? calc : (measures.length ? measures : [null]);
    const meaExprs = meaSource.map((m, i) => {
      let colExpr;
      if (calc.length) {
        colExpr = buildCalcSql(m.expr, { dbType: db.dbType, allowedCols }).sql;
      } else {
        colExpr = m ? (useJoin ? t1(m) : ident(m)) : null;
      }
      const expr = aggExpr(aggregation, colExpr, db.dbType);
      return `${expr} AS v${i + 1}`;
    });

    const selectList = [...dimExprs, ...meaExprs].join(", ");
    const from = useJoin
      ? `${tableRef(table)} t1 JOIN ${tableRef(join.table)} t2 ON ${t1(join.localKey)} = ${t2(join.targetKey || "id")}`
      : tableRef(table);

    // GROUP BY semua dimensi (tanpa dimensi = agregat tunggal, mis. gauge)
    const groupExprs = dims.map((d, i) =>
      grainWrap(useJoin && i === 0 ? t2(join.label) : (useJoin ? t1(d) : ident(d)), i)
    );
    const groupBy = groupExprs.length ? `GROUP BY ${groupExprs.join(", ")}` : "";

    const orderBy = groupExprs.length
      ? `ORDER BY ${sortBy === "label" ? "d1 ASC" : "v1 DESC"}`
      : "";

    // Top-N (R2-4): batasi baris. 0/negatif → default 100 (plafon aman).
    const limit = topN > 0 ? Math.min(topN, 100) : 100;

    return db.query(
      `SELECT ${selectList} FROM ${from} ${where} ${groupBy} ${orderBy} LIMIT ${limit}`,
      bindParams
    );
  },

  /** Profil semua kolom: tipe + cardinality + flag numerik/temporal. */
  async profileTable(tableName) {
    const columns = await this.getColumns(tableName);
    const rowCount = await this.getRowCount(tableName);

    const profiled = [];
    for (const col of columns) {
      const distinct = await this.getDistinctCount(tableName, col.name);
      profiled.push({
        name: col.name,
        type: col.type,
        pk: col.pk,
        distinct,
        numeric: isNumericType(col.type),
        temporal: isTemporal(col.name, col.type),
        uniqueness: rowCount > 0 ? distinct / rowCount : 0,
      });
    }
    return { tableName, rowCount, columns: profiled };
  },
};

export default suggestionsRepository;
