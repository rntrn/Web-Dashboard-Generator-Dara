/**
 * dialect.js — perbedaan sintaks antar driver, dikumpulkan di SATU tempat.
 *
 * Kenapa ada berkas ini?
 *   SQL yang dibangun DARA harus jalan di MySQL maupun SQLite. Perbedaannya
 *   sedikit tapi tersebar (cara mengutip nama kolom, fungsi tanggal, dst).
 *   Kalau percabangan `if (dbType === ...)` dibiarkan menyebar di banyak file,
 *   menambah driver baru berarti berburu ke seluruh kode.
 *
 *   Aturan: modul lain TIDAK menulis backtick/tanda kutip sendiri. Selalu
 *   lewat `ident()` / `tableRef()` dari sini.
 *
 * Menambah driver baru (mis. PostgreSQL):
 *   1. tambahkan cabang di setiap fungsi di bawah,
 *   2. tambahkan driver di config/database.js,
 *   3. tidak perlu menyentuh modul lain.
 */

/**
 * Kutip nama kolom/tabel supaya aman dipakai walau mengandung kata kunci
 * atau huruf besar.
 *   mysql  -> `nama`   (backtick; tanda kutip ganda BUKAN identifier di MySQL
 *                       kecuali mode ANSI_QUOTES aktif)
 *   sqlite -> "nama"
 * Backtick/kutip di dalam nama digandakan agar tidak bisa keluar dari kutipan.
 */
export function ident(name, dbType = "mysql") {
  const s = String(name);
  if (dbType === "mysql") return "`" + s.replace(/`/g, "``") + "`";
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Referensi tabel — sama seperti ident(), dipisah agar niatnya jelas. */
export function tableRef(name, dbType = "mysql") {
  return ident(name, dbType);
}

/**
 * Ekspresi LIMIT. MySQL dan SQLite sama-sama `LIMIT n`, jadi seragam.
 * Disediakan sebagai fungsi supaya driver lain (mis. Oracle) tinggal
 * menimpanya tanpa mengubah pemanggil.
 */
export function limitClause(dbType = "mysql") {
  return "LIMIT ?";
}

/**
 * Tipe kolom untuk tabel hasil upload CSV/Excel.
 * @param {"TEXT"|"NUMBER"} kind
 */
export function uploadColumnType(kind, dbType = "mysql") {
  if (dbType === "mysql") return kind === "NUMBER" ? "DOUBLE" : "TEXT";
  return kind === "NUMBER" ? "REAL" : "TEXT";
}

/** Panjang maksimum nama tabel/kolom yang aman untuk driver ini. */
export function maxIdentLength(dbType = "mysql") {
  return dbType === "mysql" ? 64 : 64;
}

/**
 * Bungkus sebuah ekspresi SELECT dengan CAST ke tipe target — dipakai
 * Data Preparation (dataprep.service.js) untuk "ubah tipe kolom" tanpa
 * menyentuh baris aslinya (CAST dievaluasi saat CREATE TABLE ... AS SELECT,
 * bukan UPDATE). Target sengaja dibatasi num/text saja — sama seperti
 * dikotomi upload (`uploadColumnType`), bukan tipe SQL lengkap.
 * @param {string} expr   ekspresi SQL siap pakai (mis. "t1.`gaji`")
 * @param {"num"|"text"} kind
 */
export function castExpr(expr, kind, dbType = "mysql") {
  if (kind !== "num" && kind !== "text") return expr;
  if (dbType === "mysql") return `CAST(${expr} AS ${kind === "num" ? "DOUBLE" : "CHAR"})`;
  return `CAST(${expr} AS ${kind === "num" ? "REAL" : "TEXT"})`;
}

export default { ident, tableRef, limitClause, uploadColumnType, maxIdentLength, castExpr };
