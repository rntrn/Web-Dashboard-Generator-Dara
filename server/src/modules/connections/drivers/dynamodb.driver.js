/**
 * Driver adapter — Amazon DynamoDB.
 * Paket npm `@aws-sdk/client-dynamodb` DAN `@aws-sdk/util-dynamodb`
 * (untuk unmarshall item) TIDAK di-bundle default — jalankan
 * `npm install @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb` di
 * folder server/.
 *
 * Tier "document" — item DynamoDB sudah berupa map atribut, di-unmarshall
 * jadi objek JS biasa lalu diperlakukan sama seperti dokumen (field
 * bertingkat/array → JSON string), sama seperti mongodb.driver.js.
 *
 * `config.endpoint` (opsional) berguna untuk DynamoDB Local saat
 * pengembangan (`http://localhost:8000`), tanpa perlu akun AWS sungguhan.
 *
 * CATATAN: belum diuji terhadap DynamoDB sungguhan di sandbox
 * pengembangan ini (tidak tersedia) — mengikuti dokumentasi resmi AWS SDK
 * v3. Verifikasi manual dianjurkan saat pertama kali dipakai produksi.
 */

let sdk = null;
async function loadSdk() {
  if (sdk) return sdk;
  try {
    const client = await import("@aws-sdk/client-dynamodb");
    const util = await import("@aws-sdk/util-dynamodb");
    sdk = { ...client, unmarshall: util.unmarshall };
  } catch {
    throw new Error(
      'Driver DynamoDB belum siap: paket npm "@aws-sdk/client-dynamodb" dan "@aws-sdk/util-dynamodb" belum ter-install. ' +
      "Jalankan `npm install @aws-sdk/client-dynamodb @aws-sdk/util-dynamodb` di folder server/, atau `npm run driver:install -- dynamodb`."
    );
  }
  return sdk;
}

async function connect(config) {
  const { DynamoDBClient } = await loadSdk();
  return new DynamoDBClient({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    endpoint: config.endpoint || undefined,
  });
}

async function test(config) {
  const { ListTablesCommand } = await loadSdk();
  const client = await connect(config);
  try {
    await client.send(new ListTablesCommand({ Limit: 1 }));
    return { ok: true };
  } finally {
    client.destroy();
  }
}

async function listTables(config) {
  const { ListTablesCommand } = await loadSdk();
  const client = await connect(config);
  try {
    const r = await client.send(new ListTablesCommand({}));
    return (r.TableNames || []).map((name) => ({ name, approxRows: null }));
  } finally {
    client.destroy();
  }
}

async function previewRows(config, table, limit = 50) {
  const { ScanCommand, unmarshall } = await loadSdk();
  const client = await connect(config);
  try {
    const r = await client.send(new ScanCommand({ TableName: table, Limit: Number(limit) || 50 }));
    const rows = (r.Items || []).map((item) => {
      const plain = unmarshall(item);
      const flat = {};
      for (const [k, v] of Object.entries(plain)) flat[k] = (v !== null && typeof v === "object") ? JSON.stringify(v) : v;
      return flat;
    });
    const columnSet = new Set();
    for (const row of rows) for (const k of Object.keys(row)) columnSet.add(k);
    return { columns: [...columnSet], rows };
  } finally {
    client.destroy();
  }
}

export default { key: "dynamodb", test, listTables, previewRows };
