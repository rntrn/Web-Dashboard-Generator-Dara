/**
 * Driver adapter — PostgreSQL (juga cocok untuk CockroachDB, yang
 * wire-protocol-compatible dengan Postgres).
 *
 * `pg` di-import LAZY (dynamic import) — kalau paket belum ter-install
 * (npm install belum dijalankan ulang setelah fitur ini ditambahkan),
 * error-nya baru muncul saat driver ini benar-benar dipakai, bukan saat
 * server boot. Pesan error dibuat jelas supaya gampang ditelusuri.
 */

let pgModule = null;
async function loadPg() {
  if (pgModule) return pgModule;
  try {
    pgModule = (await import("pg")).default;
  } catch {
    throw new Error(
      "Driver PostgreSQL belum siap: paket npm \"pg\" belum ter-install. " +
      "Jalankan `npm install` di folder server/ (sudah ditambahkan ke package.json)."
    );
  }
  return pgModule;
}

/** @param {{host,port,database,user,password,ssl}} config */
async function connect(config) {
  const pg = await loadPg();
  const client = new pg.Client({
    host: config.host,
    port: Number(config.port || 5432),
    database: config.database,
    user: config.user,
    password: config.password || "",
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
  });
  await client.connect();
  return client;
}

async function test(config) {
  const client = await connect(config);
  try {
    await client.query("SELECT 1");
    return { ok: true };
  } finally {
    await client.end();
  }
}

async function listTables(config) {
  const client = await connect(config);
  try {
    const { rows } = await client.query(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       ORDER BY table_name`
    );
    return rows.map((r) => ({ name: r.name, approxRows: null }));
  } finally {
    await client.end();
  }
}

async function previewRows(config, table, limit = 50) {
  const client = await connect(config);
  try {
    const ident = '"' + String(table).replace(/"/g, '""') + '"';
    const { rows, fields } = await client.query(`SELECT * FROM ${ident} LIMIT $1`, [Number(limit) || 50]);
    return { columns: fields.map((f) => f.name), rows };
  } finally {
    await client.end();
  }
}

export default { key: "postgres", test, listTables, previewRows };
