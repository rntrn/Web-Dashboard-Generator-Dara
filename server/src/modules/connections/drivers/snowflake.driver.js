/**
 * Driver adapter — Snowflake.
 * Paket npm `snowflake-sdk` TIDAK di-bundle default — jalankan
 * `npm install snowflake-sdk` di folder server/.
 *
 * `snowflake-sdk` memakai API berbasis callback (bukan Promise native),
 * jadi dibungkus manual di sini dengan `promisify`-style wrapper.
 *
 * CATATAN: belum diuji terhadap akun Snowflake sungguhan di sandbox
 * pengembangan ini (tidak tersedia) — mengikuti dokumentasi resmi paket
 * `snowflake-sdk`. Verifikasi manual dianjurkan saat pertama kali dipakai
 * produksi.
 */

let snowflake = null;
async function loadSdk() {
  if (snowflake) return snowflake;
  try {
    snowflake = (await import("snowflake-sdk")).default;
  } catch {
    throw new Error('Driver Snowflake belum siap: paket npm "snowflake-sdk" belum ter-install. Jalankan `npm install snowflake-sdk` di folder server/, atau `npm run driver:install -- snowflake`.');
  }
  return snowflake;
}

function connectAsync(conn) {
  return new Promise((resolve, reject) => {
    conn.connect((err, c) => (err ? reject(err) : resolve(c)));
  });
}

function executeAsync(conn, sqlText, binds = []) {
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, stmt, rows) => (err ? reject(err) : resolve({ stmt, rows })),
    });
  });
}

function destroyAsync(conn) {
  return new Promise((resolve) => conn.destroy(() => resolve()));
}

async function connect(config) {
  const sdk = await loadSdk();
  const conn = sdk.createConnection({
    account: config.account,
    username: config.user,
    password: config.password || "",
    warehouse: config.warehouse || undefined,
    database: config.database || undefined,
    schema: config.schema || undefined,
    role: config.role || undefined,
  });
  await connectAsync(conn);
  return conn;
}

async function test(config) {
  const conn = await connect(config);
  try {
    await executeAsync(conn, "SELECT 1");
    return { ok: true };
  } finally {
    await destroyAsync(conn);
  }
}

async function listTables(config) {
  const conn = await connect(config);
  try {
    const { rows } = await executeAsync(conn, "SHOW TABLES");
    return (rows || []).map((r) => ({ name: r.name || r.NAME, approxRows: r.rows ?? r.ROWS ?? null }));
  } finally {
    await destroyAsync(conn);
  }
}

async function previewRows(config, table, limit = 50) {
  const conn = await connect(config);
  try {
    const ident = '"' + String(table).replace(/"/g, '""') + '"';
    const { rows } = await executeAsync(conn, `SELECT * FROM ${ident} LIMIT ${Number(limit) || 50}`);
    const columns = rows && rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows: rows || [] };
  } finally {
    await destroyAsync(conn);
  }
}

export default { key: "snowflake", test, listTables, previewRows };
