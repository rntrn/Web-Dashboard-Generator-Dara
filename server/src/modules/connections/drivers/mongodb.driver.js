/**
 * Driver adapter — MongoDB.
 * Paket npm `mongodb` TIDAK di-bundle default — jalankan
 * `npm install mongodb` di folder server/.
 *
 * Tier "document" — hasilnya BUKAN tabel asli. `listTables` = daftar
 * collection, `previewRows` = flatten best-effort dari dokumen (field
 * bertingkat/array diubah jadi string JSON supaya tetap tampil sebagai
 * satu kolom) — data preparation nyata (pemetaan kolom penuh) menyusul di
 * fase berikutnya, lihat docs/08-data-connection.md.
 *
 * CATATAN: belum diuji terhadap MongoDB sungguhan di sandbox pengembangan
 * ini (tidak tersedia) — mengikuti dokumentasi resmi paket `mongodb`.
 * Verifikasi manual dianjurkan saat pertama kali dipakai produksi.
 */

let MongoClientCtor = null;
async function loadClient() {
  if (MongoClientCtor) return MongoClientCtor;
  try {
    MongoClientCtor = (await import("mongodb")).MongoClient;
  } catch {
    throw new Error('Driver MongoDB belum siap: paket npm "mongodb" belum ter-install. Jalankan `npm install mongodb` di folder server/, atau `npm run driver:install -- mongodb`.');
  }
  return MongoClientCtor;
}

function buildUri(config) {
  const auth = config.user ? `${encodeURIComponent(config.user)}:${encodeURIComponent(config.password || "")}@` : "";
  const qs = config.authSource ? `?authSource=${encodeURIComponent(config.authSource)}` : "";
  return `mongodb://${auth}${config.host}:${config.port || 27017}${qs}`;
}

async function connect(config) {
  const MongoClient = await loadClient();
  const client = new MongoClient(buildUri(config), { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  return client;
}

/** Ratakan satu dokumen: field bertingkat/array jadi string JSON, _id jadi string. */
function flattenDoc(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (k === "_id") { out._id = String(v); continue; }
    if (v !== null && typeof v === "object") out[k] = JSON.stringify(v);
    else out[k] = v;
  }
  return out;
}

async function test(config) {
  const client = await connect(config);
  try {
    await client.db(config.database || "admin").command({ ping: 1 });
    return { ok: true };
  } finally {
    await client.close();
  }
}

async function listTables(config) {
  const client = await connect(config);
  try {
    const cols = await client.db(config.database).listCollections().toArray();
    return cols.map((c) => ({ name: c.name, approxRows: null }));
  } finally {
    await client.close();
  }
}

async function previewRows(config, table, limit = 50) {
  const client = await connect(config);
  try {
    const docs = await client.db(config.database).collection(table).find({}).limit(Number(limit) || 50).toArray();
    const rows = docs.map(flattenDoc);
    const columnSet = new Set();
    for (const r of rows) for (const k of Object.keys(r)) columnSet.add(k);
    return { columns: [...columnSet], rows };
  } finally {
    await client.close();
  }
}

export default { key: "mongodb", test, listTables, previewRows };
