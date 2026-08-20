/**
 * Relations Repository — baca override relasi dari tabel `dara_relations`.
 *
 * Tabel ini kecil dan jarang berubah, jadi isinya di-cache di memori selama
 * TTL pendek. Tanpa cache, setiap chart lintas-tabel akan menembak database
 * satu kali hanya untuk membaca beberapa baris.
 */

import Database from "../../config/database.js";

const db = new Database();
const TTL_MS = 60_000;

let cache = null;
let cacheSampai = 0;

export const relationsRepository = {
  /**
   * Semua override relasi, dikelompokkan per tabel asal.
   * @returns {Promise<Map<string, Array<{column, refTable, refColumn, joinType}>>>}
   *          kunci Map = nama tabel asal HURUF BESAR
   */
  async semuaOverride() {
    if (cache && Date.now() < cacheSampai) return cache;

    const peta = new Map();
    try {
      const rows = await db.query(
        `SELECT from_table, from_column, to_table, to_column, join_type
         FROM dara_relations`
      );
      for (const r of rows) {
        const kunci = String(r.from_table).toUpperCase();
        if (!peta.has(kunci)) peta.set(kunci, []);
        peta.get(kunci).push({
          column: r.from_column,
          refTable: r.to_table,
          refColumn: r.to_column,
          joinType: r.join_type || "LEFT",
        });
      }
    } catch {
      // Tabel belum dibuat (mis. mode SQLite tanpa migrasi) → tanpa override.
      // Bukan kondisi galat: deteksi otomatis tetap jalan.
    }

    cache = peta;
    cacheSampai = Date.now() + TTL_MS;
    return peta;
  },

  /** Kosongkan cache — dipanggil setelah relasi diubah lewat API. */
  bersihkanCache() {
    cache = null;
    cacheSampai = 0;
  },
};

export default relationsRepository;
