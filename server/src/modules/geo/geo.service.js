/**
 * Geo Service — deteksi tabel yang bisa jadi layer peta + ambil fitur GeoJSON.
 *
 * Dua jenis layer:
 *  - AREA  : tabel punya kolom GeoJSON (nama mengandung geojson/geometry/geom/
 *            boundary/wkt) berisi Polygon/MultiPolygon. -> choropleth.
 *  - POINT : tabel punya sepasang kolom lat & lng (latitude/longitude). -> marker.
 *
 * Filter memakai binding aman (?) — kolom divalidasi regex di controller.
 */

import Database from "../../config/database.js";
import { databasesRepository } from "../databases/databases.repository.js";
import { buildFilterClause } from "../../lib/filterSql.js";
import { ident as quoteIdent } from "../../lib/dialect.js";

const db = new Database();

const GEO_COL = /(geojson|geometry|geom|boundary|wkt)$/i;
const LAT_COL = /^(lat|latitude|y)$/i;
const LNG_COL = /^(lng|lon|long|longitude|x)$/i;
const isNumeric = (t) => /INT|REAL|NUM|DEC|FLOAT|DOUBLE/i.test(t || "");

const ident = (c) => quoteIdent(c, db.dbType);
const tableRef = (t) => quoteIdent(t, db.dbType);

/** Bangun klausa WHERE dari filter (equality/multi-pilih/rentang, binding aman). */
function buildWhere(filters, colSet) {
  return buildFilterClause(filters, colSet, { dbType: db.dbType, ident });
}

/**
 * Pastikan nama kolom yang diminta klien ada di colSet (hasil getTableInfo,
 * yang sudah menyaring kolom sensitif). Query di sini pakai `SELECT *` lalu
 * mengambil field lewat nama di objek JS (bukan identifier SQL), jadi tidak
 * ada risiko injeksi — tapi TANPA pemeriksaan ini, kolom apa pun yang ada di
 * tabel (termasuk password_hash) bisa "dibaca ulang" lewat parameter
 * labelColumn/valueColumn/categoryColumn. Ini yang menutup celah itu.
 */
function assertColumnAllowed(colName, colSet, label = "Kolom") {
  if (!colName) return;
  if (!colSet.has(String(colName).toUpperCase()))
    throw new Error(`${label} "${colName}" tidak dikenali pada tabel ini`);
}

export const geoService = {
  /** Deteksi semua tabel geo (dari daftar tabel yg terlihat). */
  async detectTables() {
    const tables = await databasesRepository.getTables();
    const result = [];
    for (const t of tables) {
      const cols = await databasesRepository.getTableInfo(t);
      const names = cols.map((c) => c.name);
      const geoCol = names.find((n) => GEO_COL.test(n));
      const latCol = names.find((n) => LAT_COL.test(n));
      const lngCol = names.find((n) => LNG_COL.test(n));
      const numericCols = cols.filter((c) => isNumeric(c.type)).map((c) => c.name);
      const textCols = cols.filter((c) => !isNumeric(c.type)).map((c) => c.name);

      if (geoCol) {
        result.push({ table: t, kind: "area", geoColumn: geoCol,
          valueColumns: numericCols, labelColumns: textCols, columns: names });
      } else if (latCol && lngCol) {
        result.push({ table: t, kind: "point", latColumn: latCol, lngColumn: lngCol,
          valueColumns: numericCols, labelColumns: textCols, columns: names });
      }
    }
    return result;
  },

  /** FeatureCollection untuk layer AREA (parse kolom GeoJSON). */
  async areaFeatures(table, { geoColumn, valueColumn, labelColumn, filters }) {
    const cols = await databasesRepository.getTableInfo(table);
    const colSet = new Set(cols.map((c) => c.name.toUpperCase()));
    assertColumnAllowed(geoColumn, colSet, "Kolom geometri");
    assertColumnAllowed(valueColumn, colSet, "Kolom nilai");
    assertColumnAllowed(labelColumn, colSet, "Kolom label");
    const { where, params } = buildWhere(filters, colSet);
    const rows = await db.query(`SELECT * FROM ${tableRef(table)} ${where}`, params);

    const features = [];
    for (const r of rows) {
      const raw = r[geoColumn] ?? r[geoColumn?.toUpperCase?.()];
      if (!raw) continue;
      let geometry;
      try { geometry = typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch { continue; }
      features.push({
        type: "Feature",
        geometry,
        properties: {
          label: labelColumn ? r[labelColumn] : undefined,
          value: valueColumn ? Number(r[valueColumn]) : undefined,
        },
      });
    }
    return { type: "FeatureCollection", features };
  },

  /** FeatureCollection titik untuk layer POINT (lat/lng). */
  async pointFeatures(table, { latColumn, lngColumn, valueColumn, labelColumn, categoryColumn, filters }) {
    const cols = await databasesRepository.getTableInfo(table);
    const colSet = new Set(cols.map((c) => c.name.toUpperCase()));
    assertColumnAllowed(latColumn, colSet, "Kolom latitude");
    assertColumnAllowed(lngColumn, colSet, "Kolom longitude");
    assertColumnAllowed(valueColumn, colSet, "Kolom nilai");
    assertColumnAllowed(labelColumn, colSet, "Kolom label");
    assertColumnAllowed(categoryColumn, colSet, "Kolom kategori");
    const { where, params } = buildWhere(filters, colSet);
    const rows = await db.query(`SELECT * FROM ${tableRef(table)} ${where}`, params);

    const features = rows.map((r) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [Number(r[lngColumn]), Number(r[latColumn])] },
      properties: {
        label: labelColumn ? r[labelColumn] : undefined,
        value: valueColumn ? Number(r[valueColumn]) : undefined,
        category: categoryColumn ? r[categoryColumn] : undefined,
      },
    })).filter((f) => Number.isFinite(f.geometry.coordinates[0]) && Number.isFinite(f.geometry.coordinates[1]));

    return { type: "FeatureCollection", features };
  },
};

export default geoService;
