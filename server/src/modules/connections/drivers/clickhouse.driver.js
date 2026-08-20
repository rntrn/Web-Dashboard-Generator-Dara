/**
 * Driver adapter — ClickHouse.
 * Paket npm `@clickhouse/client` TIDAK di-bundle default — jalankan
 * `npm install @clickhouse/client` di folder server/.
 *
 * CATATAN: belum diuji terhadap ClickHouse sungguhan di sandbox
 * pengembangan ini (tidak tersedia) — mengikuti dokumentasi resmi paket
 * `@clickhouse/client`. Verifikasi manual dianjurkan saat pertama kali
 * dipakai produksi.
 */

let createClientFn = null;
async function loadClient() {
  if (createClientFn) return createClientFn;
  try {
    createClientFn = (await import("@clickhouse/client")).createClient;
  } catch {
    throw new Error('Driver ClickHouse belum siap: paket npm "@clickhouse/client" belum ter-install. Jalankan `npm install @clickhouse/client` di folder server/, atau `npm run driver:install -- clickhouse`.');
  }
  return createClientFn;
}

async function connect(config) {
  const createClient = await loadClient();
  const proto = config.ssl ? "https" : "http";
  return createClient({
    url: `${proto}://${config.host}:${config.port || 8123}`,
    username: config.user || "default",
    password: config.password || "",
    database: config.database || "default",
    request_timeout: 8000,
  });
}

async function test(config) {
  const client = await connect(config);
  try {
    await client.query({ query: "SELECT 1" });
    return { ok: true };
  } finally {
    await client.close();
  }
}

async function listTables(config) {
  const client = await connect(config);
  try {
    const rs = await client.query({ query: "SHOW TABLES", format: "JSONEachRow" });
    const rows = await rs.json();
    return rows.map((r) => ({ name: r.name, approxRows: null }));
  } finally {
    await client.close();
  }
}

async function previewRows(config, table, limit = 50) {
  const client = await connect(config);
  try {
    const ident = "`" + String(table).replace(/`/g, "``") + "`";
    const rs = await client.query({ query: `SELECT * FROM ${ident} LIMIT ${Number(limit) || 50}`, format: "JSONEachRow" });
    const rows = await rs.json();
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows };
  } finally {
    await client.close();
  }
}

export default { key: "clickhouse", test, listTables, previewRows };
