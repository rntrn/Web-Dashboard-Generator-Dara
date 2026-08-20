/**
 * Driver adapter — Pinecone (vector database).
 * Paket npm `@pinecone-database/pinecone` TIDAK di-bundle default —
 * jalankan `npm install @pinecone-database/pinecone` di folder server/.
 *
 * Tier "vector" — TIDAK COCOK untuk dashboard tabular biasa (lihat
 * docs/08-data-connection.md). Index Pinecone isinya embedding untuk
 * similarity search, bukan baris data. Di sini:
 *   - `listTables` = daftar INDEX (bukan tabel).
 *   - `previewRows` TIDAK mengembalikan baris vektor (tidak masuk akal
 *     untuk dichart) — melainkan RINGKASAN statistik index
 *     (describeIndexStats) sebagai satu-dua baris ringkasan saja.
 * Dukungan ini sengaja minimal — prioritas rendah per desain awal fitur.
 *
 * CATATAN: belum diuji terhadap Pinecone sungguhan di sandbox
 * pengembangan ini (tidak tersedia) — mengikuti dokumentasi resmi
 * `@pinecone-database/pinecone`. Verifikasi manual dianjurkan saat
 * pertama kali dipakai produksi.
 */

let PineconeCtor = null;
async function loadSdk() {
  if (PineconeCtor) return PineconeCtor;
  try {
    PineconeCtor = (await import("@pinecone-database/pinecone")).Pinecone;
  } catch {
    throw new Error('Driver Pinecone belum siap: paket npm "@pinecone-database/pinecone" belum ter-install. Jalankan `npm install @pinecone-database/pinecone` di folder server/, atau `npm run driver:install -- pinecone`.');
  }
  return PineconeCtor;
}

async function connect(config) {
  const Pinecone = await loadSdk();
  return new Pinecone({ apiKey: config.apiKey });
}

async function test(config) {
  const pc = await connect(config);
  await pc.listIndexes();
  return { ok: true };
}

async function listTables(config) {
  const pc = await connect(config);
  const r = await pc.listIndexes();
  return (r.indexes || []).map((i) => ({ name: i.name, approxRows: null }));
}

/** `table` diabaikan sengaja — kita pakai config.indexName (satu koneksi = satu index). */
async function previewRows(config) {
  const pc = await connect(config);
  const stats = await pc.index(config.indexName).describeIndexStats();
  const rows = [
    { metric: "totalRecordCount", value: stats.totalRecordCount ?? null },
    { metric: "dimension", value: stats.dimension ?? null },
    { metric: "indexFullness", value: stats.indexFullness ?? null },
  ];
  return { columns: ["metric", "value"], rows };
}

export default { key: "pinecone", test, listTables, previewRows };
