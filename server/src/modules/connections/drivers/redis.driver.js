/**
 * Driver adapter — Redis.
 * Paket npm `redis` TIDAK di-bundle default — jalankan `npm install redis`
 * di folder server/.
 *
 * Tier "kv" — Redis BUKAN tabular sama sekali (key-value murni). Dipetakan
 * paksa jadi konsep "tabel" ala DARA dengan asumsi konvensi penamaan key
 * `prefix:sisanya` (umum dipakai banyak aplikasi):
 *   - `listTables` = daftar PREFIX unik (bagian sebelum ":" pertama),
 *     didapat dari SCAN sampel (maks 1000 key) — bukan penghitungan pasti.
 *   - `previewRows(prefix)` = SCAN key yang match `prefix:*`, kembalikan
 *     {key, type, value} per key (value string di-preview, tipe lain
 *     cuma ditandai tipenya).
 * Kalau key di database Redis Anda tidak memakai konvensi ini, daftar
 * "tabel" bisa kosong/tidak berguna — sesuai peringatan di
 * docs/08-data-connection.md, Redis memang cakupan sempit di sini.
 *
 * CATATAN: belum diuji terhadap Redis sungguhan di sandbox pengembangan
 * ini (tidak tersedia) — mengikuti dokumentasi resmi paket `redis`.
 * Verifikasi manual dianjurkan saat pertama kali dipakai produksi.
 */

let createClientFn = null;
async function loadClient() {
  if (createClientFn) return createClientFn;
  try {
    createClientFn = (await import("redis")).createClient;
  } catch {
    throw new Error('Driver Redis belum siap: paket npm "redis" belum ter-install. Jalankan `npm install redis` di folder server/, atau `npm run driver:install -- redis`.');
  }
  return createClientFn;
}

async function connect(config) {
  const createClient = await loadClient();
  const client = createClient({
    socket: { host: config.host, port: Number(config.port || 6379), connectTimeout: 8000 },
    password: config.password || undefined,
    database: config.db ? Number(config.db) : undefined,
  });
  await client.connect();
  return client;
}

async function test(config) {
  const client = await connect(config);
  try {
    await client.ping();
    return { ok: true };
  } finally {
    await client.quit();
  }
}

async function listTables(config) {
  const client = await connect(config);
  try {
    const prefixes = new Set();
    let cursor = "0";
    let scanned = 0;
    do {
      const res = await client.scan(cursor, { COUNT: 200 });
      cursor = res.cursor;
      for (const key of res.keys) {
        const idx = key.indexOf(":");
        prefixes.add(idx > -1 ? key.slice(0, idx) : key);
      }
      scanned += res.keys.length;
    } while (cursor !== "0" && scanned < 1000);
    return [...prefixes].sort().map((p) => ({ name: p, approxRows: null }));
  } finally {
    await client.quit();
  }
}

async function previewRows(config, prefix, limit = 50) {
  const client = await connect(config);
  try {
    const rows = [];
    let cursor = "0";
    const max = Number(limit) || 50;
    do {
      const res = await client.scan(cursor, { MATCH: `${prefix}:*`, COUNT: 200 });
      cursor = res.cursor;
      for (const key of res.keys) {
        if (rows.length >= max) break;
        const type = await client.type(key);
        let value = null;
        if (type === "string") value = await client.get(key);
        rows.push({ key, type, value: value != null ? String(value).slice(0, 500) : null });
      }
    } while (cursor !== "0" && rows.length < max);
    return { columns: ["key", "type", "value"], rows };
  } finally {
    await client.quit();
  }
}

export default { key: "redis", test, listTables, previewRows };
