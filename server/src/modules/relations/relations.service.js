/**
 * Relations Service — resolusi relasi antar-tabel (untuk auto-JOIN).
 *
 * DARA perlu tahu bahwa mis. dara_data_pegawai.unit_id menunjuk ke
 * dara_data_unit.id, dan kolom mana yang dipakai sebagai label
 * (mis. dara_data_unit.nama).
 *
 * Relasi dicari dengan urutan prioritas berikut — yang lebih tinggi menang:
 *
 *   1) OVERRIDE MANUAL   isi tabel `dara_relations`
 *      Untuk skema yang tidak mengikuti konvensi apa pun.
 *
 *   2) FOREIGN KEY ASLI  dibaca dari information_schema (MySQL)
 *      Paling dapat dipercaya. Ini yang membuat data contoh bawaan bekerja:
 *      dara_data_pegawai.unit_id punya FK ke dara_data_unit.
 *
 *   3) KONVENSI NAMA     kolom "<x>_id" → tabel "<prefix><x>s"
 *      (product_id → dara_data_products). Cadangan untuk tabel tanpa FK,
 *      mis. hasil upload CSV.
 *
 * Hasil tiap relasi: { column, refTable, refColumn, labelColumn }
 */

import { databasesRepository } from "../databases/databases.repository.js";
import { relationsRepository } from "./relations.repository.js";

/** Pluralisasi sederhana untuk konvensi (product → products, city → cities). */
function pluralize(word) {
  if (/[^aeiou]y$/i.test(word)) return word.replace(/y$/i, "ies");
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + "es";
  return word + "s";
}

/** Tebak nama tabel referensi dari kolom "<x>_id". */
function guessRefTable(column, prefix) {
  const m = /^(.*)_id$/i.exec(column);
  if (!m) return null;
  return prefix + pluralize(m[1].toLowerCase());
}

/**
 * Pilih kolom label pada tabel referensi: kolom teks pertama yang bukan
 * primary key, bukan "id", dan bukan kolom waktu. Fallback ke "id".
 */
function pickLabelColumn(columns) {
  const textual = columns.find(
    (c) =>
      !c.pk &&
      !/^id$/i.test(c.name) &&
      !/_at$/i.test(c.name) &&
      /CHAR|TEXT|CLOB|VARCHAR/i.test(c.type || "")
  );
  return textual ? textual.name : "id";
}

export const relationsService = {
  /**
   * Daftar relasi sebuah tabel.
   * @param {string} tableName
   * @returns {Promise<Array<{column, refTable, refColumn, labelColumn}>>}
   */
  async resolveRelations(tableName) {
    const prefix = process.env.DB_TABLE_PREFIX || "";
    const allTables = await databasesRepository.getTables();
    const tableSet = new Set(allTables.map((t) => t.toUpperCase()));
    const namaAsli = (t) => allTables.find((x) => x.toUpperCase() === t.toUpperCase());

    /** Lengkapi sebuah relasi dengan kolom label dari tabel referensi. */
    const lengkapi = async (rel) => {
      const real = namaAsli(rel.refTable);
      if (!real) return null;
      const refCols = await databasesRepository.getTableInfo(real);
      return {
        column: rel.column,
        refTable: real,
        refColumn: rel.refColumn || "id",
        labelColumn: pickLabelColumn(refCols),
      };
    };

    // --- 1) Override manual dari tabel dara_relations ---
    const overrides = await relationsRepository.semuaOverride();
    const manual = overrides.get(String(tableName).toUpperCase());
    if (manual && manual.length) {
      const hasil = await Promise.all(manual.map(lengkapi));
      return hasil.filter(Boolean);
    }

    const columns = await databasesRepository.getTableInfo(tableName);
    const relations = [];
    const sudahAda = new Set(); // cegah kolom yang sama muncul dua kali

    // --- 2) Foreign key asli ---
    for (const col of columns) {
      if (!col.fk || !col.fk.table) continue;
      if (!tableSet.has(String(col.fk.table).toUpperCase())) continue;
      const rel = await lengkapi({
        column: col.name,
        refTable: col.fk.table,
        refColumn: col.fk.column || "id",
      });
      if (rel) { relations.push(rel); sudahAda.add(col.name.toUpperCase()); }
    }

    // --- 3) Konvensi nama, hanya untuk kolom yang belum tertangani ---
    for (const col of columns) {
      if (col.pk) continue;
      if (sudahAda.has(col.name.toUpperCase())) continue;
      if (!/_id$/i.test(col.name)) continue;

      const tebakan = guessRefTable(col.name, prefix);
      if (!tebakan || !tableSet.has(tebakan.toUpperCase())) continue;

      const rel = await lengkapi({ column: col.name, refTable: tebakan, refColumn: "id" });
      if (rel) relations.push(rel);
    }

    return relations;
  },
};

export default relationsService;
