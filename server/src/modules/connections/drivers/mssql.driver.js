/**
 * Driver adapter — Microsoft SQL Server.
 * Paket npm `mssql` TIDAK di-bundle default — jalankan
 * `npm install mssql` di folder server/ kalau mau memakai driver ini
 * (lihat drivers/registry.js untuk kebijakan "preinstalled").
 *
 * CATATAN: belum diuji terhadap SQL Server sungguhan di sandbox pengembangan
 * ini (tidak tersedia) — mengikuti dokumentasi resmi paket `mssql`.
 * Verifikasi manual dianjurkan saat pertama kali dipakai produksi.
 */

let sqlModule = null;
async function loadSql() {
  if (sqlModule) return sqlModule;
  try {
    sqlModule = (await import("mssql")).default;
  } catch {
    throw new Error('Driver SQL Server belum siap: paket npm "mssql" belum ter-install. Jalankan `npm install mssql` di folder server/, atau `npm run driver:install -- mssql`.');
  }
  return sqlModule;
}

async function connect(config) {
  const sql = await loadSql();
  return sql.connect({
    server: config.host,
    port: Number(config.port || 1433),
    database: config.database || undefined,
    user: config.user,
    password: config.password || "",
    options: { encrypt: !!config.ssl, trustServerCertificate: true },
    connectionTimeout: 8000,
  });
}

async function test(config) {
  const pool = await connect(config);
  try {
    await pool.request().query("SELECT 1");
    return { ok: true };
  } finally {
    await pool.close();
  }
}

async function listTables(config) {
  const pool = await connect(config);
  try {
    const r = await pool.request().query(
      "SELECT TABLE_NAME AS name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
    );
    return r.recordset.map((row) => ({ name: row.name, approxRows: null }));
  } finally {
    await pool.close();
  }
}

async function previewRows(config, table, limit = 50) {
  const pool = await connect(config);
  try {
    const ident = "[" + String(table).replace(/]/g, "]]") + "]";
    const r = await pool.request().query(`SELECT TOP ${Number(limit) || 50} * FROM ${ident}`);
    const columns = r.recordset.columns ? Object.keys(r.recordset.columns) : (r.recordset[0] ? Object.keys(r.recordset[0]) : []);
    return { columns, rows: r.recordset };
  } finally {
    await pool.close();
  }
}

export default { key: "mssql", test, listTables, previewRows };
