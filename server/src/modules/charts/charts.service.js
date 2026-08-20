/**
 * Charts Service — logika simpan/daftar/hapus chart buatan user.
 *
 * Sebuah "chart tersimpan" adalah spesifikasi (bukan data), berisi cukup info
 * untuk di-render ulang kapan pun via endpoint chart-data:
 *   { id, name, table, chartType, dimension, measure, aggregation, join }
 */

import { chartsRepository } from "./charts.repository.js";
import { CHART_TYPES, isCombinationValid } from "../../config/chartTypes.js";
import { filterAccessible, canManageItem, sanitizeSharedWith } from "../../lib/acl.js";
import { AGGS } from "../../lib/aggExpr.js";
import { buildCalcSql } from "../../lib/calcExpr.js";

const SAFE = /^[A-Za-z0-9_]+$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
/** Kalkulasi tabel (post-agregasi, diterapkan di frontend). */
const TABLE_CALCS = ["pct_of_total", "running_total"];
/** Operator conditional formatting (harus selaras client/src/lib/condFormat.js). */
const COND_OPS = [">", ">=", "<", "<=", "=", "between"];

/**
 * Validasi & normalisasi spesifikasi conditional formatting (Tabel/Pivot).
 * Kembalikan objek bersih atau null. Lempar Error bila bentuk salah.
 */
function validateCondFormat(cf) {
  if (cf == null) return null;
  if (typeof cf !== "object") throw new Error("Conditional formatting tidak valid");
  if (!["scale", "rules"].includes(cf.mode)) throw new Error("Mode conditional formatting tidak valid");

  if (cf.mode === "scale") {
    if (!HEX.test(cf.color || "")) throw new Error("Warna scale harus hex #RRGGBB");
    return { mode: "scale", color: cf.color };
  }
  // mode "rules"
  const rules = Array.isArray(cf.rules) ? cf.rules : [];
  if (rules.length === 0) throw new Error("Aturan conditional formatting kosong");
  if (rules.length > 10) throw new Error("Maksimal 10 aturan conditional formatting");
  const clean = rules.map((r) => {
    if (!COND_OPS.includes(r.op)) throw new Error("Operator aturan tidak valid");
    if (!HEX.test(r.color || "")) throw new Error("Warna aturan harus hex #RRGGBB");
    if (typeof r.value !== "number" || Number.isNaN(r.value)) throw new Error("Nilai aturan harus angka");
    const out = { op: r.op, value: r.value, color: r.color };
    if (r.op === "between") {
      if (typeof r.value2 !== "number" || Number.isNaN(r.value2)) throw new Error("Batas kedua 'between' harus angka");
      out.value2 = r.value2;
    }
    return out;
  });
  return { mode: "rules", rules: clean };
}

/**
 * Validasi spesifikasi chart (v0.5.0: dimensions[] + measures[]).
 * Tetap menerima bentuk lama {dimension, measure} demi kompatibilitas.
 */
function validateSpec(spec) {
  if (!spec || typeof spec !== "object") throw new Error("Spesifikasi kosong");
  if (!spec.name || !spec.name.trim()) throw new Error("Nama chart wajib diisi");

  // ---- PETA (v0.19.0): multi-layer ----
  if (spec.chartType === "map") {
    const g = spec.geo || {};
    const chk = (v) => v == null || v === "" || SAFE.test(v);
    if (!chk(g.filterColumn)) throw new Error("Kolom filter peta tidak valid");

    const layers = Array.isArray(g.layers) ? g.layers : [];
    if (layers.length === 0) throw new Error("Peta butuh minimal satu layer");
    if (layers.length > 12) throw new Error("Maksimal 12 layer");

    for (const L of layers) {
      if (!["area", "point"].includes(L.type)) throw new Error("Tipe layer tidak valid");
      if (!SAFE.test(L.table || "")) throw new Error("Tabel layer tidak valid");
      const cols = [L.geoColumn, L.latColumn, L.lngColumn, L.valueColumn,
        L.labelColumn, L.categoryColumn];
      for (const c of cols) if (!chk(c)) throw new Error("Kolom layer tidak valid");
      if (L.type === "area" && !SAFE.test(L.geoColumn || ""))
        throw new Error("Layer area butuh kolom GeoJSON");
      if (L.type === "point" && (!SAFE.test(L.latColumn || "") || !SAFE.test(L.lngColumn || "")))
        throw new Error("Layer titik butuh kolom lat & lng");
    }
    return { map: true };
  }

  // Normalisasi bentuk lama -> baru
  const dimensions = spec.dimensions || (spec.dimension ? [spec.dimension] : []);
  const measures = spec.measures || (spec.measure ? [spec.measure] : []);

  const { name, table, chartType, aggregation, join } = spec;
  if (!name || !name.trim()) throw new Error("Nama chart wajib diisi");
  if (!SAFE.test(table || "")) throw new Error("Nama tabel tidak valid");

  const type = CHART_TYPES.find((t) => t.id === chartType);
  if (!type) throw new Error(`Tipe chart tidak dikenal: ${chartType}`);

  // Calculated field (R2-5): validasi sintaks ekspresi (aman) di sini; kolom
  // dicek saat query. Calc measure ikut dihitung sebagai measure.
  let calcMeasures = [];
  if (Array.isArray(spec.calcMeasures) && spec.calcMeasures.length) {
    if (spec.calcMeasures.length > 2) throw new Error("Maksimal 2 calculated field");
    calcMeasures = spec.calcMeasures.map((c) => {
      if (!c || typeof c.expr !== "string" || !c.expr.trim())
        throw new Error("Ekspresi calculated field kosong");
      buildCalcSql(c.expr, {}); // lempar bila sintaks tak aman/valid
      return { name: String(c.name || "Hitung").slice(0, 60), expr: c.expr.trim() };
    });
  }
  const meaCount = calcMeasures.length || measures.length;

  // PRASYARAT: kombinasi dim/measure harus sesuai deklarasi tipe chart.
  if (!isCombinationValid(type, dimensions.length, meaCount)) {
    throw new Error(
      `Tipe "${type.name}" butuh ${type.minDim}-${type.maxDim} dimensi dan ` +
      `${type.minMea}-${type.maxMea} measure ` +
      `(dipilih: ${dimensions.length} dimensi, ${meaCount} measure)`
    );
  }

  for (const d of dimensions) if (!SAFE.test(d)) throw new Error("Dimensi tidak valid");
  for (const m of measures) if (!SAFE.test(m)) throw new Error("Measure tidak valid");
  if (aggregation && !AGGS.includes(aggregation))
    throw new Error("Agregasi tidak valid");
  if (spec.tableCalc && !TABLE_CALCS.includes(spec.tableCalc))
    throw new Error("Kalkulasi tabel tidak valid");
  if (spec.dateGrain && !["year", "month", "day"].includes(spec.dateGrain))
    throw new Error("Grain tanggal tidak valid");
  if (spec.topN != null && (!Number.isInteger(spec.topN) || spec.topN < 0 || spec.topN > 100))
    throw new Error("Top-N harus bilangan 0–100");
  // Conditional formatting hanya relevan untuk Tabel/Pivot.
  const condFormat = ["table", "pivot"].includes(chartType)
    ? validateCondFormat(spec.condFormat)
    : null;
  if (spec.color && !/^#[0-9a-fA-F]{6}$/.test(spec.color))
    throw new Error("Warna harus format hex #RRGGBB");
  if (spec.format && !["number", "thousands", "currency", "percent", "compact"].includes(spec.format))
    throw new Error("Format angka tidak valid");
  if (join) {
    if (!SAFE.test(join.table || "") || !SAFE.test(join.localKey || "") || !SAFE.test(join.label || ""))
      throw new Error("Parameter join tidak valid");
  }

  return { dimensions, measures, condFormat, calcMeasures };
}

export const chartsService = {
  /** Daftar chart yang boleh diakses user (ACL). Tanpa user → semua (internal). */
  list(user = null) {
    return user ? filterAccessible(chartsRepository.list(), user) : chartsRepository.list();
  },

  /** Set daftar NIP yang dibagikan (pemilik/admin). */
  setSharedWith(id, nips, user = null) {
    const items = chartsRepository.list();
    const existing = items.find((c) => c.id === id);
    if (!existing) throw new Error("Chart tidak ditemukan");
    if (!canManageItem(existing, user))
      throw new Error("Hanya pembuat atau admin yang boleh membagikan chart ini");
    existing.sharedWith = sanitizeSharedWith(nips);
    chartsRepository.replaceAll(items.map((c) => (c.id === id ? existing : c)));
    return existing;
  },

  /**
   * Simpan chart baru. `user` = req.user (dari JWT) -> dicatat sebagai pembuat.
   */
  save(spec, user = null) {
    const v = validateSpec(spec);
    const base = {
      id: `chart_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: spec.name.trim(),
      chartType: spec.chartType,
      createdBy: user ? { nip: user.nip, nama: user.nama } : null,
      sharedWith: [], // B1: daftar NIP yang diberi akses oleh pembuat
      createdAt: new Date().toISOString(),
    };
    const chart = v.map
      ? { ...base, geo: spec.geo }
      : { ...base, table: spec.table, dimensions: v.dimensions, measures: v.measures,
          aggregation: spec.aggregation || (v.measures.length ? "SUM" : "COUNT"),
          join: spec.join || null, color: spec.color || null, format: spec.format || null,
          tableCalc: spec.tableCalc || null, condFormat: v.condFormat,
          dateGrain: spec.dateGrain || null, topN: spec.topN || 0,
          calcMeasures: v.calcMeasures };
    return chartsRepository.add(chart);
  },

  /**
   * Perbarui chart yang ada — hanya pemilik atau admin.
   * createdBy dipertahankan; tanggal ubah dicatat.
   */
  update(id, spec, user = null) {
    const items = chartsRepository.list();
    const existing = items.find((c) => c.id === id);
    if (!existing) throw new Error("Chart tidak ditemukan");

    const isAdmin = user && user.role === "admin";
    const isOwner = user && existing.createdBy && existing.createdBy.nip === user.nip;
    if (!isAdmin && !isOwner)
      throw new Error("Hanya pembuat atau admin yang boleh mengubah chart ini");

    const v = validateSpec(spec);
    const updated = v.map
      ? { ...existing, name: spec.name.trim(), chartType: "map", geo: spec.geo,
          table: undefined, dimensions: undefined, measures: undefined, join: undefined,
          updatedAt: new Date().toISOString() }
      : { ...existing, name: spec.name.trim(), table: spec.table, chartType: spec.chartType,
          dimensions: v.dimensions, measures: v.measures,
          aggregation: spec.aggregation || (v.measures.length ? "SUM" : "COUNT"),
          join: spec.join || null, color: spec.color || null, format: spec.format || null,
          tableCalc: spec.tableCalc || null, condFormat: v.condFormat,
          dateGrain: spec.dateGrain || null, topN: spec.topN || 0,
          calcMeasures: v.calcMeasures,
          geo: undefined, updatedAt: new Date().toISOString() };
    // tulis ulang seluruh koleksi (metaStore sederhana)
    const next = items.map((c) => (c.id === id ? updated : c));
    // pakai writeAll lewat repository add? Repository tak punya update -> tulis manual.
    chartsRepository.replaceAll(next);
    return updated;
  },

  /**
   * Hapus chart — hanya pemilik atau admin.
   * Chart lama tanpa createdBy: hanya admin yang boleh hapus.
   */
  remove(id, user = null) {
    const chart = chartsRepository.list().find((c) => c.id === id);
    if (!chart) return false;
    const isAdmin = user && user.role === "admin";
    const isOwner = user && chart.createdBy && chart.createdBy.nip === user.nip;
    if (!isAdmin && !isOwner) {
      throw new Error("Hanya pembuat atau admin yang boleh menghapus chart ini");
    }
    return chartsRepository.remove(id);
  },

  /**
   * Hapus SEMUA chart yang boleh dikelola user (admin: semua; user: miliknya).
   * ACL-aware → aman untuk multi-user. Mengembalikan jumlah terhapus.
   */
  removeManageable(user = null) {
    const items = chartsRepository.list();
    const keep = items.filter((c) => !canManageItem(c, user));
    chartsRepository.replaceAll(keep);
    return { deleted: items.length - keep.length };
  },
};

export default chartsService;
