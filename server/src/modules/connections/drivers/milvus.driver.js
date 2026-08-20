/**
 * Driver adapter — Milvus (vector database).
 * Paket npm `@zilliz/milvus2-sdk-node` TIDAK di-bundle default —
 * jalankan `npm install @zilliz/milvus2-sdk-node` di folder server/.
 *
 * Tier "vector" — sama seperti Pinecone, TIDAK cocok untuk dashboard
 * tabular biasa (lihat docs/08-data-connection.md). Di sini:
 *   - `listTables` = daftar COLLECTION.
 *   - `previewRows` mengembalikan sampel field skalar (non-vektor) tiap
 *     entity via query sederhana — kolom embedding vektornya sendiri
 *     TIDAK ditampilkan (tidak berguna sebagai teks/angka di tabel).
 * Dukungan ini sengaja minimal — prioritas rendah per desain awal fitur.
 *
 * CATATAN: belum diuji terhadap Milvus sungguhan di sandbox pengembangan
 * ini (tidak tersedia) — mengikuti dokumentasi resmi
 * `@zilliz/milvus2-sdk-node`. Verifikasi manual dianjurkan saat pertama
 * kali dipakai produksi.
 */

let MilvusClientCtor = null;
async function loadSdk() {
  if (MilvusClientCtor) return MilvusClientCtor;
  try {
    MilvusClientCtor = (await import("@zilliz/milvus2-sdk-node")).MilvusClient;
  } catch {
    throw new Error('Driver Milvus belum siap: paket npm "@zilliz/milvus2-sdk-node" belum ter-install. Jalankan `npm install @zilliz/milvus2-sdk-node` di folder server/, atau `npm run driver:install -- milvus`.');
  }
  return MilvusClientCtor;
}

async function connect(config) {
  const MilvusClient = await loadSdk();
  return new MilvusClient({
    address: config.address,
    username: config.username || undefined,
    password: config.password || undefined,
    token: config.token || undefined,
  });
}

async function test(config) {
  const client = await connect(config);
  const r = await client.checkHealth();
  if (r.isHealthy === false) throw new Error("Milvus melaporkan status tidak sehat (unhealthy).");
  return { ok: true };
}

async function listTables(config) {
  const client = await connect(config);
  const r = await client.listCollections();
  return (r.data || []).map((c) => ({ name: c.name, approxRows: null }));
}

async function previewRows(config, table, limit = 50) {
  const client = await connect(config);
  const r = await client.query({ collection_name: table, limit: Number(limit) || 50, output_fields: ["*"] });
  const rows = (r.data || []).map((entity) => {
    const flat = {};
    for (const [k, v] of Object.entries(entity)) {
      if (Array.isArray(v) && v.length > 8) continue; // buang kolom vektor besar (embedding), tidak berguna sebagai teks
      flat[k] = (v !== null && typeof v === "object") ? JSON.stringify(v) : v;
    }
    return flat;
  });
  const columnSet = new Set();
  for (const row of rows) for (const k of Object.keys(row)) columnSet.add(k);
  return { columns: [...columnSet], rows };
}

export default { key: "milvus", test, listTables, previewRows };
