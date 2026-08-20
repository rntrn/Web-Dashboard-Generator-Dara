/**
 * Metadata Store — penyimpanan data MILIK DARA sendiri (chart, dashboard,
 * story, pengguna, pengaturan, log aktivitas). Bukan sumber data dashboard.
 *
 * ---------------------------------------------------------------------------
 * DUA MODE (env META_STORE)
 * ---------------------------------------------------------------------------
 *   "mysql" (default) : setiap koleksi disimpan di tabelnya sendiri
 *                       (dara_charts, dara_dashboards, ...). Ini yang dipakai
 *                       installer.
 *   "file"            : setiap koleksi = satu berkas JSON di server/data/.
 *                       Berguna untuk mencoba DARA tanpa database.
 *
 * ---------------------------------------------------------------------------
 * KENAPA API-nya SINKRON padahal MySQL asinkron?
 * ---------------------------------------------------------------------------
 * Seluruh repository DARA memanggil `metaStore.readAll(...)` tanpa `await`.
 * Mengubah semuanya jadi async berarti menyentuh puluhan berkas sekaligus.
 * Jadi metaStore memakai pola CACHE WRITE-THROUGH:
 *
 *   boot   → `await metaStore.init()` memuat SEMUA koleksi ke memori sekali.
 *   read   → dilayani dari memori (sinkron, cepat).
 *   write  → memori diperbarui SEKARANG, lalu ditulis ke MySQL di belakang
 *            layar lewat antrean berurutan (tidak ada dua tulis bertabrakan).
 *
 * KONSEKUENSI yang harus Anda tahu:
 *   1. Cocok untuk SATU proses server. Kalau menjalankan banyak instance
 *      (cluster/PM2 -i), tiap instance punya cache sendiri dan bisa saling
 *      menimpa.
 *   2. Data yang baru ditulis sudah terbaca langsung dari memori, tapi baru
 *      ada di MySQL beberapa milidetik kemudian.
 *   3. Kegagalan tulis dilaporkan lewat `metaStore.lastError` dan console —
 *      tidak dilempar ke pemanggil, supaya satu kegagalan log aktivitas
 *      tidak menggagalkan permintaan pengguna.
 *
 * ---------------------------------------------------------------------------
 * POLA "dokumen + proyeksi"
 * ---------------------------------------------------------------------------
 * Kolom `doc` di tiap tabel berisi dokumen JSON utuh — itulah yang dibaca
 * kembali. Kolom lain (nama, owner_nip, chart_type, ...) adalah salinan agar
 * datanya bisa di-query dari SQL. Fungsi proyeksi ada di PROJECTORS di bawah.
 * Menambah kolom proyeksi = tambahkan di sini + di db/schema/001_core.sql.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "./database.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "../../data");

const mode = (process.env.META_STORE || "mysql").toLowerCase();
const db = new Database();

/** Ambil nilai pertama yang tidak kosong dari beberapa nama field alternatif. */
const pick = (obj, ...keys) => {
  for (const k of keys) {
    const v = k.split(".").reduce((o, part) => (o == null ? o : o[part]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
};

const jsonOrNull = (v) => (v == null ? null : JSON.stringify(v));
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

/**
 * Peta koleksi → tabel + cara memproyeksikan dokumen ke kolom.
 *
 * `columns` mengembalikan objek { nama_kolom: nilai } TANPA kolom `doc`
 * (doc ditambahkan otomatis). Urutan kolom tidak penting.
 */
const PROJECTORS = {
  charts: {
    table: "dara_charts",
    order: "created_at, id",
    columns: (d) => ({
      id: d.id,
      nama: clip(pick(d, "name", "nama"), 150),
      chart_type: clip(d.chartType, 30),
      table_name: clip(pick(d, "table", "tableName"), 120),
      owner_nip: clip(pick(d, "createdBy.nip", "ownerNip"), 30),
      shared_with: jsonOrNull(d.sharedWith),
    }),
  },
  dashboards: {
    table: "dara_dashboards",
    order: "created_at, id",
    columns: (d) => ({
      id: d.id,
      nama: clip(pick(d, "name", "nama"), 150),
      subjudul: clip(pick(d, "subtitle", "subjudul"), 255),
      tema: clip(pick(d, "theme", "tema"), 30),
      owner_nip: clip(pick(d, "createdBy.nip", "ownerNip"), 30),
      shared_with: jsonOrNull(d.sharedWith),
      jumlah_item: Array.isArray(d.items) ? d.items.length : 0,
      status: d.status === "LIVE" || d.status === "ARSIP" ? d.status : "DRAFT",
    }),
  },
  stories: {
    table: "dara_stories",
    order: "created_at, id",
    columns: (d) => ({
      id: d.id,
      nama: clip(pick(d, "name", "nama"), 150),
      owner_nip: clip(pick(d, "createdBy.nip", "ownerNip"), 30),
      shared_with: jsonOrNull(d.sharedWith),
      jumlah_langkah: Array.isArray(d.steps) ? d.steps.length : 0,
    }),
  },
  // CATATAN: TIDAK ADA entri "users" di sini. Pengguna aplikasi hidup di
  // dara_data_pegawai (lihat db/schema/002_sample_tables.sql), diakses lewat
  // server/src/modules/users/users.repository.js dengan SQL baris-per-baris
  // — BUKAN lewat metaStore. Alasannya: writeAll() di bawah ini men-DELETE
  // seluruh tabel lalu INSERT ulang, yang aman untuk koleksi kecil yang
  // sepenuhnya dikuasai aplikasi, tapi akan menghapus SEMUA data HR pegawai
  // kalau dipakai di tabel yang juga berisi data pegawai. Detail lengkap ada
  // di komentar db/schema/001_core.sql bagian "3. Pengguna".
  uploads: {
    table: "dara_uploads",
    order: "created_at, id",
    columns: (d) => ({
      id: d.id || d.tableName,
      table_name: clip(d.tableName, 120),
      filename: clip(pick(d, "filename", "name"), 255),
      format: clip(d.format, 10),
      total_rows: Number(d.rowCount ?? d.totalRows ?? 0) || 0,
      failed_rows: Number(d.failedRows ?? 0) || 0,
      owner_nip: clip(pick(d, "createdBy.nip", "ownerNip"), 30),
      shared_with: jsonOrNull(d.sharedWith),
    }),
  },
  activity: {
    table: "dara_activity",
    order: "ts, id",
    key: null, // append-only, tidak punya kunci logis
    columns: (d) => ({
      ts: (d.ts || new Date().toISOString()).replace("T", " ").slice(0, 19),
      actor_nip: clip(d.nip, 30),
      actor_nama: clip(d.nama, 120),
      aksi: clip(d.action, 60) || "-",
      target: clip(d.target, 40),
      detail: clip(d.detail, 255),
    }),
  },
  connections: {
    table: "dara_connections",
    order: "created_at, id",
    columns: (d) => ({
      id: d.id,
      nama: clip(d.nama, 150),
      driver: clip(d.driver, 30),
      status: ["AKTIF", "GAGAL"].includes(d.status) ? d.status : "BELUM_DITES",
      owner_nip: clip(pick(d, "createdBy.nip", "ownerNip"), 30),
    }),
  },
  // Fase 1 Data Connection (import/materialize) — lihat
  // connections/connImports.service.js dan db/schema/009_conn_imports.sql.
  // Pola SAMA PERSIS seperti "uploads" di atas (tabel hasil beda prefix,
  // dara_data_conn_* vs dara_data_upl_*).
  connImports: {
    table: "dara_conn_imports",
    order: "created_at, id",
    columns: (d) => ({
      id: d.id,
      table_name: clip(d.tableName, 120),
      nama: clip(d.name, 150),
      connection_id: clip(d.connectionId, 64),
      source_table: clip(d.sourceTable, 255),
      total_rows: Number(d.rowCount ?? 0) || 0,
      owner_nip: clip(pick(d, "createdBy.nip", "ownerNip"), 30),
      shared_with: jsonOrNull(d.sharedWith),
    }),
  },
  // Fase 2 Data Preparation (recipe engine) — lihat
  // dataprep/dataprep.service.js dan db/schema/010_dataprep.sql. Pola SAMA
  // seperti "connImports"/"uploads" di atas (tabel hasil beda prefix,
  // dara_data_prep_* vs dara_data_conn_*/dara_data_upl_*).
  dataprep: {
    table: "dara_dataprep",
    order: "created_at, id",
    columns: (d) => ({
      id: d.id,
      table_name: clip(d.tableName, 120),
      nama: clip(d.name, 150),
      source_table: clip(d.sourceTable, 120),
      join_table: clip(d.joinTable, 120),
      total_rows: Number(d.rowCount ?? 0) || 0,
      owner_nip: clip(pick(d, "createdBy.nip", "ownerNip"), 30),
      shared_with: jsonOrNull(d.sharedWith),
    }),
  },
  settings: {
    table: "dara_settings",
    order: "id",
    singleton: true,
    columns: (d) => ({
      id: 1,
      admin_user: clip(d.adminUser, 50) || "admin",
      admin_hash: clip(d.adminHash, 100) || "",
      app_name: clip(d.appName, 100) || "DARA Free",
      dev_mode: d.devMode ? 1 : 0,
      acl_enabled: d.aclEnabled ? 1 : 0,
      upload_enabled: d.uploadEnabled ? 1 : 0,
    }),
  },
};

/** Koleksi yang dikenali. Koleksi lain otomatis jatuh ke mode file. */
export const COLLECTIONS = Object.keys(PROJECTORS);

// ---------------------------------------------------------------------------
// Cache + antrean tulis
// ---------------------------------------------------------------------------

const cache = new Map();   // collection -> Array<Object>
let ready = false;
let writeChain = Promise.resolve(); // rantai promise → tulis selalu berurutan

function filePath(collection) {
  return path.join(dataDir, `${collection}.json`);
}

function readFileCollection(collection) {
  try {
    return JSON.parse(fs.readFileSync(filePath(collection), "utf-8"));
  } catch {
    return [];
  }
}

function writeFileCollection(collection, items) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(filePath(collection), JSON.stringify(items, null, 2));
}

/** Muat satu koleksi dari MySQL ke cache, mempertahankan urutan simpan. */
async function loadFromMysql(collection) {
  const p = PROJECTORS[collection];
  if (!p) return readFileCollection(collection);
  const rows = await db.query(`SELECT doc FROM ${p.table} ORDER BY ${p.order}`);
  return rows
    .map((r) => (typeof r.doc === "string" ? JSON.parse(r.doc) : r.doc))
    .filter(Boolean);
}

/**
 * Tulis ulang seluruh koleksi ke MySQL, dalam SATU transaksi.
 *
 * Strategi: DELETE semua lalu INSERT ulang. Sengaja sederhana — `writeAll`
 * memang bersemantik "ganti seluruh isi koleksi", dan jumlah barisnya kecil
 * (ratusan, bukan jutaan). Transaksi memastikan tabel tidak pernah terlihat
 * kosong oleh pembaca lain, dan isinya kembali utuh bila INSERT gagal.
 * Kalau nanti koleksi tumbuh besar, ganti dengan diff per-id.
 */
async function saveToMysql(collection, items) {
  const p = PROJECTORS[collection];
  if (!p) return writeFileCollection(collection, items);

  const rows = items.map((doc) => ({ ...p.columns(doc), doc: JSON.stringify(doc) }));

  await db.withTransaction(async (tx) => {
    await tx.exec(`DELETE FROM ${p.table}`);
    if (rows.length === 0) return;
    const colNames = Object.keys(rows[0]);
    const placeholders = colNames.map(() => "?").join(", ");
    const sql = `INSERT INTO ${p.table} (${colNames.join(", ")}) VALUES (${placeholders})`;
    await tx.execMany(sql, rows.map((r) => colNames.map((c) => r[c])));
  });
}

export const metaStore = {
  /** Mode aktif: "mysql" | "file". */
  mode,

  /** Kesalahan tulis terakhir (null bila tidak ada). Dipakai endpoint health. */
  lastError: null,

  /**
   * Muat semua koleksi ke memori. WAJIB dipanggil sekali saat boot sebelum
   * server menerima permintaan. Aman dipanggil berulang (idempotent).
   */
  async init() {
    if (ready) return;
    for (const c of COLLECTIONS) {
      cache.set(c, mode === "mysql" ? await loadFromMysql(c) : readFileCollection(c));
    }
    ready = true;
  },

  /** Baca seluruh isi koleksi (array). Kosong bila belum ada. */
  readAll(collection) {
    if (cache.has(collection)) return cache.get(collection);
    // Koleksi di luar daftar (atau init belum jalan) → ambil dari berkas.
    const items = readFileCollection(collection);
    cache.set(collection, items);
    return items;
  },

  /** Ganti seluruh isi koleksi. Memori langsung, MySQL menyusul. */
  writeAll(collection, items) {
    cache.set(collection, items);

    if (mode !== "mysql" || !PROJECTORS[collection]) {
      writeFileCollection(collection, items);
      return;
    }

    // Antrekan agar penulisan berurutan; salin array supaya perubahan
    // berikutnya tidak mengubah data yang sedang ditulis.
    const snapshot = JSON.parse(JSON.stringify(items));
    writeChain = writeChain
      .then(() => saveToMysql(collection, snapshot))
      .then(() => { metaStore.lastError = null; })
      .catch((err) => {
        metaStore.lastError = `${collection}: ${err.message}`;
        console.error(`✗ Gagal menyimpan koleksi "${collection}" ke MySQL:`, err.message);
      });
  },

  /** Tunggu semua penulisan tertunda selesai (dipakai saat shutdown & tes). */
  async flush() {
    await writeChain;
  },
};

export default metaStore;
