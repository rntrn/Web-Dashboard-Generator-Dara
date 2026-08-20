/** Konstanta aplikasi DARA. */
module.exports = {
  MAX_FAILED_LOGIN: 5,
  LOCK_MINUTES: 15,
  // Driver yang benar-benar diimplementasikan ada di config/database.js.
  // Daftar ini hanya untuk validasi input di form koneksi.
  DB_TYPES: ["MYSQL", "SQLITE"],
  DASHBOARD_TYPES: ["OPERASIONAL", "STRATEGIS", "ANALITIK", "TAKTIS"],
  QUERY_TIMEOUT_SECONDS: 30,
  MAX_ROWS: 50000,
};
