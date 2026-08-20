/**
 * Driver adapter — Neo4j.
 * Paket npm `neo4j-driver` TIDAK di-bundle default — jalankan
 * `npm install neo4j-driver` di folder server/.
 *
 * Tier "graph" — TIDAK ada konsep "tabel" di graf. `listTables` di sini
 * mengembalikan LABEL node (mis. "Person", "Order") sebagai pengganti
 * tabel. `previewRows` = MATCH (n:Label) RETURN n LIMIT n, lalu properti
 * node diratakan jadi kolom — INI BUKAN traversal relasi/graf penuh,
 * cuma properti node itu sendiri.
 *
 * CATATAN: belum diuji terhadap Neo4j sungguhan di sandbox pengembangan
 * ini (tidak tersedia) — mengikuti dokumentasi resmi paket `neo4j-driver`.
 * Verifikasi manual dianjurkan saat pertama kali dipakai produksi.
 */

let neo4j = null;
async function loadDriver() {
  if (neo4j) return neo4j;
  try {
    neo4j = (await import("neo4j-driver")).default;
  } catch {
    throw new Error('Driver Neo4j belum siap: paket npm "neo4j-driver" belum ter-install. Jalankan `npm install neo4j-driver` di folder server/, atau `npm run driver:install -- neo4j`.');
  }
  return neo4j;
}

async function openSession(config) {
  const driverLib = await loadDriver();
  const driver = driverLib.driver(
    `bolt://${config.host}:${config.port || 7687}`,
    driverLib.auth.basic(config.user, config.password || ""),
    { connectionTimeout: 8000 }
  );
  const session = driver.session({ database: config.database || undefined });
  return { driver, session };
}

async function test(config) {
  const { driver, session } = await openSession(config);
  try {
    await session.run("RETURN 1");
    return { ok: true };
  } finally {
    await session.close();
    await driver.close();
  }
}

async function listTables(config) {
  const { driver, session } = await openSession(config);
  try {
    const r = await session.run("CALL db.labels() YIELD label RETURN label ORDER BY label");
    return r.records.map((rec) => ({ name: rec.get("label"), approxRows: null }));
  } finally {
    await session.close();
    await driver.close();
  }
}

async function previewRows(config, table, limit = 50) {
  const driverLib = await loadDriver();
  const { driver, session } = await openSession(config);
  try {
    const label = String(table).replace(/`/g, "");
    const r = await session.run(`MATCH (n:\`${label}\`) RETURN n LIMIT $limit`, { limit: driverLib.int(Number(limit) || 50) });
    const rows = r.records.map((rec) => {
      const props = rec.get("n").properties;
      const flat = {};
      for (const [k, v] of Object.entries(props)) flat[k] = (v && typeof v === "object" && "low" in v) ? v.toNumber() : v;
      return flat;
    });
    const columnSet = new Set();
    for (const row of rows) for (const k of Object.keys(row)) columnSet.add(k);
    return { columns: [...columnSet], rows };
  } finally {
    await session.close();
    await driver.close();
  }
}

export default { key: "neo4j", test, listTables, previewRows };
