/**
 * Driver adapter — Apache Cassandra.
 * Paket npm `cassandra-driver` TIDAK di-bundle default — jalankan
 * `npm install cassandra-driver` di folder server/.
 *
 * CQL mirip SQL (SELECT/LIMIT dikenal), jadi diperlakukan sebagai tier
 * "sql" — hasilnya sudah tabular tanpa perlu flatten seperti MongoDB.
 *
 * CATATAN: belum diuji terhadap Cassandra sungguhan di sandbox
 * pengembangan ini (tidak tersedia) — mengikuti dokumentasi resmi paket
 * `cassandra-driver`. Verifikasi manual dianjurkan saat pertama kali
 * dipakai produksi.
 */

let cassandraModule = null;
async function loadDriver() {
  if (cassandraModule) return cassandraModule;
  try {
    cassandraModule = (await import("cassandra-driver")).default;
  } catch {
    throw new Error('Driver Cassandra belum siap: paket npm "cassandra-driver" belum ter-install. Jalankan `npm install cassandra-driver` di folder server/, atau `npm run driver:install -- cassandra`.');
  }
  return cassandraModule;
}

/** config.database di sini diisi nama keyspace (lihat registry.js). */
async function connect(config) {
  const cassandra = await loadDriver();
  const client = new cassandra.Client({
    contactPoints: [config.host],
    localDataCenter: config.localDataCenter,
    keyspace: config.database || undefined,
    protocolOptions: { port: Number(config.port || 9042) },
    credentials: config.user ? { username: config.user, password: config.password || "" } : undefined,
    socketOptions: { connectTimeout: 8000 },
  });
  await client.connect();
  return client;
}

async function test(config) {
  const client = await connect(config);
  try {
    await client.execute("SELECT release_version FROM system.local");
    return { ok: true };
  } finally {
    await client.shutdown();
  }
}

async function listTables(config) {
  const client = await connect(config);
  try {
    const r = await client.execute("SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?", [config.database]);
    return r.rows.map((row) => ({ name: row.table_name, approxRows: null }));
  } finally {
    await client.shutdown();
  }
}

async function previewRows(config, table, limit = 50) {
  const client = await connect(config);
  try {
    const ident = '"' + String(table).replace(/"/g, '""') + '"';
    const r = await client.execute(`SELECT * FROM ${ident} LIMIT ${Number(limit) || 50}`);
    const columns = r.columns ? r.columns.map((c) => c.name) : [];
    return { columns, rows: r.rows };
  } finally {
    await client.shutdown();
  }
}

export default { key: "cassandra", test, listTables, previewRows };
