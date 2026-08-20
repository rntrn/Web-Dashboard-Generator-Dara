/**
 * Driver registry — Data Connection.
 *
 * Setiap driver = satu deskriptor DRIVER_DEFS[i] { key, label, tier,
 * fields[], preinstalled } (metadata untuk UI, aman dikirim ke client) +
 * modul adapter { test(config), listTables(config), previewRows(config,
 * table, limit) } yang benar-benar menjalankan koneksi (TIDAK dikirim ke
 * client, hanya dipakai server).
 *
 * v0.41.0 — SEMUA 16 driver yang diminta sekarang punya adapter kode
 * (comingSoon dihapus). Tapi TIDAK semua paket npm-nya di-bundle di
 * package.json — lihat `preinstalled` di bawah. Alasan: beberapa driver
 * (Snowflake, DynamoDB, Firestore, Pinecone, Milvus, Oracle, dll) makan
 * ratusan MB node_modules dan/atau native binding yang kebanyakan
 * pengguna DARA Free tidak butuh sama sekali. Kalau semua di-bundle,
 * instalasi dasar jadi berat untuk semua orang demi driver yang cuma
 * dipakai segelintir. Jadi: kode adapter SIAP, tinggal dipasang paketnya —
 * cara TERMUDAH: `npm run driver:install -- <key>` (lihat
 * scripts/install-driver.mjs, membaca `npmPackages` dari sini) — atau
 * `npm install <paket>` manual. Bisa juga dipilih saat instalasi awal
 * (installer/index.js langkah 3, opsional, butuh internet).
 *
 * FIELDS — bentuk kredensial TIDAK seragam:
 *   - Driver "host-based" (MySQL, Postgres, MSSQL, dst) pakai
 *     HOST_BASED_FIELDS (host/port/database/user/password/ssl).
 *   - Driver cloud-native (Snowflake/DynamoDB/Firestore/Pinecone) punya
 *     bentuk kredensial sendiri (account+warehouse, access key, service
 *     account JSON, API key) — didefinisikan custom per driver.
 * Field dengan `secret: true` DIENKRIPSI per-field (lihat
 * connections.service.js) — BUKAN cuma kolom "password" seperti Fase 0.
 *
 * TIER menentukan seberapa "tabular" datanya:
 *   "sql"      — bicara SQL/CQL, hasil query sudah baris/kolom.
 *   "document" — dokumen JSON (Mongo) — listTables/previewRows melakukan
 *                flatten best-effort (kolom bertingkat → JSON string).
 *   "graph"    — Neo4j — previewRows mengembalikan properti node hasil
 *                MATCH sederhana, BUKAN traversal graf penuh.
 *   "kv"       — Redis — bukan tabular sama sekali, "tabel" = prefix key.
 *   "vector"   — Pinecone/Milvus — TIDAK cocok untuk dashboard tabular
 *                (lihat docs/08-data-connection.md). previewRows di sini
 *                cuma ringkasan index, BUKAN baris data yang bisa dichart.
 *
 * ------------------------------------------------------------------
 * CARA MENAMBAH DRIVER BARU:
 *   1. Buat berkas adapter baru, ekspor default
 *      { key, test(config), listTables(config), previewRows(config,table,limit) }.
 *   2. Import & daftarkan di ADAPTERS di bawah.
 *   3. Tambahkan deskriptornya di DRIVER_DEFS (tier, fields, preinstalled).
 *   4. Kalau perlu paket npm baru, JANGAN otomatis tambahkan ke
 *      package.json kecuali driver itu memang untuk semua orang (seperti
 *      mysql/postgres) — biarkan dynamic import memberi pesan jelas.
 * Ini BUKAN plugin yang bisa dipasang lewat UI/upload berkas saat runtime
 * — sengaja tidak dibuat (risiko keamanan setara remote code execution).
 * ------------------------------------------------------------------
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import mysqlDriver from "./mysql.driver.js";
import postgresDriver from "./postgres.driver.js";
import mssqlDriver from "./mssql.driver.js";
import oracleDriver from "./oracle.driver.js";
import clickhouseDriver from "./clickhouse.driver.js";
import sqliteExtDriver from "./sqlite-ext.driver.js";
import snowflakeDriver from "./snowflake.driver.js";
import mongodbDriver from "./mongodb.driver.js";
import cassandraDriver from "./cassandra.driver.js";
import neo4jDriver from "./neo4j.driver.js";
import redisDriver from "./redis.driver.js";
import dynamodbDriver from "./dynamodb.driver.js";
import firestoreDriver from "./firestore.driver.js";
import pineconeDriver from "./pinecone.driver.js";
import milvusDriver from "./milvus.driver.js";

/** Modul adapter — kunci harus cocok dengan DRIVER_DEFS. */
const ADAPTERS = {
  mysql: mysqlDriver,
  postgres: postgresDriver,
  cockroachdb: postgresDriver, // wire-compatible Postgres, adapter sama persis
  mssql: mssqlDriver,
  oracle: oracleDriver,
  clickhouse: clickhouseDriver,
  sqlite_ext: sqliteExtDriver,
  snowflake: snowflakeDriver,
  mongodb: mongodbDriver,
  cassandra: cassandraDriver,
  neo4j: neo4jDriver,
  redis: redisDriver,
  dynamodb: dynamodbDriver,
  firestore: firestoreDriver,
  pinecone: pineconeDriver,
  milvus: milvusDriver,
};

/** Bentuk field paling umum: host/port/database/user/password/ssl. */
const HOST_BASED_FIELDS = (defaultPort, opts = {}) => [
  { key: "host", id: "Host", en: "Host", type: "text", required: true },
  { key: "port", id: "Port", en: "Port", type: "number", placeholder: String(defaultPort) },
  { key: "database", id: opts.dbLabelId || "Nama database", en: opts.dbLabelEn || "Database name", type: "text" },
  { key: "user", id: "Username", en: "Username", type: "text" },
  { key: "password", id: "Password", en: "Password", type: "password", secret: true },
  ...(opts.noSsl ? [] : [{ key: "ssl", id: opts.sslLabelId || "Gunakan SSL/TLS", en: opts.sslLabelEn || "Use SSL/TLS", type: "checkbox" }]),
  ...(opts.extra || []),
];

export const DRIVER_DEFS = [
  // --- tier SQL — dukungan penuh, bentuk kredensial umum ---
  { key: "mysql", label: "MySQL / MariaDB", tier: "sql", preinstalled: true,
    fields: HOST_BASED_FIELDS(3306) },
  { key: "postgres", label: "PostgreSQL", tier: "sql", preinstalled: true,
    fields: HOST_BASED_FIELDS(5432) },
  { key: "cockroachdb", label: "CockroachDB", tier: "sql", preinstalled: true,
    note: "wire-compatible PostgreSQL — pakai adapter postgres apa adanya",
    fields: HOST_BASED_FIELDS(26257) },
  { key: "mssql", label: "Microsoft SQL Server", tier: "sql", preinstalled: false, npmPackages: ["mssql"],
    fields: HOST_BASED_FIELDS(1433, { sslLabelId: "Enkripsi koneksi (encrypt)", sslLabelEn: "Encrypt connection" }) },
  { key: "oracle", label: "Oracle Database", tier: "sql", preinstalled: false, npmPackages: ["oracledb"],
    note: "mode bawaan (thin) cuma dukung Oracle 12.1+ — untuk 11g ke bawah, isi ORACLE_CLIENT_LIB_DIR di server/.env (lihat oracle.driver.js)",
    fields: HOST_BASED_FIELDS(1521, { dbLabelId: "Service name", dbLabelEn: "Service name", noSsl: true }) },
  { key: "clickhouse", label: "ClickHouse", tier: "sql", preinstalled: false, npmPackages: ["@clickhouse/client"],
    fields: HOST_BASED_FIELDS(8123) },
  { key: "sqlite_ext", label: "SQLite (berkas eksternal)", tier: "sql", preinstalled: true,
    note: "pakai sql.js yang sudah jadi dependency DARA — tidak perlu paket tambahan",
    fields: [{ key: "filePath", id: "Path berkas .db di server", en: "Path to .db file on the server", type: "text", required: true }] },
  { key: "snowflake", label: "Snowflake", tier: "sql", preinstalled: false, npmPackages: ["snowflake-sdk"],
    fields: [
      { key: "account", id: "Account identifier", en: "Account identifier", type: "text", required: true },
      { key: "warehouse", id: "Warehouse", en: "Warehouse", type: "text" },
      { key: "database", id: "Database", en: "Database", type: "text" },
      { key: "schema", id: "Schema", en: "Schema", type: "text", placeholder: "PUBLIC" },
      { key: "role", id: "Role", en: "Role", type: "text" },
      { key: "user", id: "Username", en: "Username", type: "text", required: true },
      { key: "password", id: "Password", en: "Password", type: "password", secret: true, required: true },
    ] },

  // --- tier dokumen/graf/kv — perlu pemetaan/flatten khusus ---
  { key: "mongodb", label: "MongoDB", tier: "document", preinstalled: false, npmPackages: ["mongodb"],
    fields: HOST_BASED_FIELDS(27017, { extra: [{ key: "authSource", id: "authSource (opsional)", en: "authSource (optional)", type: "text" }] }) },
  { key: "cassandra", label: "Apache Cassandra", tier: "sql", preinstalled: false, npmPackages: ["cassandra-driver"],
    note: "CQL mirip SQL — dianggap tier sql",
    fields: HOST_BASED_FIELDS(9042, {
      dbLabelId: "Keyspace", dbLabelEn: "Keyspace", noSsl: true,
      extra: [{ key: "localDataCenter", id: "Local data center", en: "Local data center", type: "text", required: true, placeholder: "datacenter1" }],
    }) },
  { key: "neo4j", label: "Neo4j", tier: "graph", preinstalled: false, npmPackages: ["neo4j-driver"],
    note: "previewRows = MATCH (n:Label) RETURN n LIMIT n, properti node saja — bukan traversal relasi",
    fields: HOST_BASED_FIELDS(7687, { noSsl: true, extra: [{ key: "database", id: "Database (opsional)", en: "Database (optional)", type: "text", placeholder: "neo4j" }] }) },
  { key: "redis", label: "Redis", tier: "kv", preinstalled: false, npmPackages: ["redis"],
    note: "bukan tabular — \"tabel\" di sini = prefix key sebelum ':'",
    fields: [
      { key: "host", id: "Host", en: "Host", type: "text", required: true },
      { key: "port", id: "Port", en: "Port", type: "number", placeholder: "6379" },
      { key: "password", id: "Password (opsional)", en: "Password (optional)", type: "password", secret: true },
      { key: "db", id: "Index database (opsional)", en: "Database index (optional)", type: "number", placeholder: "0" },
    ] },

  // --- tier cloud-native — bentuk kredensial beda total ---
  { key: "dynamodb", label: "Amazon DynamoDB", tier: "document", preinstalled: false, npmPackages: ["@aws-sdk/client-dynamodb", "@aws-sdk/util-dynamodb"],
    fields: [
      { key: "region", id: "Region AWS", en: "AWS region", type: "text", required: true, placeholder: "ap-southeast-1" },
      { key: "accessKeyId", id: "Access key ID", en: "Access key ID", type: "text", required: true },
      { key: "secretAccessKey", id: "Secret access key", en: "Secret access key", type: "password", secret: true, required: true },
      { key: "endpoint", id: "Endpoint kustom (opsional)", en: "Custom endpoint (optional)", type: "text", placeholder: "http://localhost:8000 (DynamoDB Local)" },
    ] },
  { key: "firestore", label: "Firebase Firestore / Realtime DB", tier: "document", preinstalled: false, npmPackages: ["firebase-admin"],
    fields: [
      { key: "projectId", id: "Project ID", en: "Project ID", type: "text", required: true },
      { key: "serviceAccountJson", id: "Service account JSON (isi file lengkap)", en: "Service account JSON (paste full file)", type: "textarea", secret: true, required: true },
    ] },
  { key: "pinecone", label: "Pinecone", tier: "vector", preinstalled: false, npmPackages: ["@pinecone-database/pinecone"],
    note: "vector DB — bukan tabular, prioritas rendah untuk dashboard (lihat docs/08-data-connection.md)",
    fields: [
      { key: "apiKey", id: "API key", en: "API key", type: "password", secret: true, required: true },
      { key: "indexName", id: "Nama index", en: "Index name", type: "text", required: true },
    ] },
  { key: "milvus", label: "Milvus", tier: "vector", preinstalled: false, npmPackages: ["@zilliz/milvus2-sdk-node"],
    note: "vector DB — bukan tabular, prioritas rendah untuk dashboard (lihat docs/08-data-connection.md)",
    fields: [
      { key: "address", id: "Address (host:port)", en: "Address (host:port)", type: "text", required: true },
      { key: "username", id: "Username (opsional)", en: "Username (optional)", type: "text" },
      { key: "password", id: "Password (opsional)", en: "Password (optional)", type: "password", secret: true },
      { key: "token", id: "Token (opsional, Zilliz Cloud)", en: "Token (optional, Zilliz Cloud)", type: "password", secret: true },
    ] },
];

// --- deteksi terpasang SESUNGGUHNYA (bukan cuma `preinstalled` statis) ---
//
// `preinstalled` di atas cuma menandai "dibundel di package.json dari
// awal" — itu FAKTA WAKTU DESAIN, TIDAK PERNAH berubah walau admin sudah
// menjalankan `npm install oracledb` belakangan (lewat installer atau
// `npm run driver:install`). Kalau UI cuma baca `preinstalled`, driver
// yang BARU dipasang tetap ditampilkan "(perlu instal)" selamanya — bikin
// bingung. Jadi di sini kita cek LANGSUNG ke folder node_modules server
// setiap kali daftar driver diminta, dan tempel hasilnya sebagai field
// BARU `installed` (computed, bukan menimpa `preinstalled`).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// drivers/ -> connections/ -> modules/ -> src/ -> server/
const SERVER_ROOT = path.join(__dirname, "..", "..", "..", "..");

function isPackageOnDisk(pkg) {
  try {
    return fs.existsSync(path.join(SERVER_ROOT, "node_modules", pkg));
  } catch {
    return false;
  }
}

function withInstalledFlag(def) {
  const installed = def.preinstalled || (def.npmPackages || []).every(isPackageOnDisk);
  return { ...def, installed };
}

export function listDriverDefs() {
  return DRIVER_DEFS.map(withInstalledFlag);
}

export function getDriverDef(key) {
  const def = DRIVER_DEFS.find((d) => d.key === key);
  return def ? withInstalledFlag(def) : null;
}

/**
 * Ambil daftar paket npm (gabungan, tanpa duplikat) yang perlu di-install
 * untuk sekumpulan kunci driver — dipakai `scripts/install-driver.mjs`
 * (dan langkah instalasi opsional di `installer/index.js`) supaya nama
 * paket HANYA didefinisikan sekali di sini, tidak diketik ulang di tempat
 * lain. Driver yang sudah `preinstalled` otomatis dilewati (tidak perlu
 * apa-apa lagi).
 */
export function getPackagesForKeys(keys) {
  const pkgs = new Set();
  const unknown = [];
  for (const key of keys) {
    const def = getDriverDef(key);
    if (!def) { unknown.push(key); continue; }
    if (def.preinstalled) continue;
    for (const p of def.npmPackages || []) pkgs.add(p);
  }
  return { packages: [...pkgs], unknown };
}

/** Ambil modul adapter siap-pakai, atau lempar error jelas kalau belum terdaftar. */
export function getAdapter(key) {
  const def = getDriverDef(key);
  if (!def) throw new Error(`Driver "${key}" tidak dikenal.`);
  const adapter = ADAPTERS[key];
  if (!adapter) throw new Error(`Driver "${def.label}" terdaftar tapi adapter-nya belum dipasang — periksa ADAPTERS di drivers/registry.js.`);
  return adapter;
}

export default { listDriverDefs, getDriverDef, getAdapter, getPackagesForKeys, DRIVER_DEFS };
