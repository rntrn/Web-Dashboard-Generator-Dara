/**
 * Driver adapter — SQLite (berkas eksternal di server).
 *
 * Pakai `sql.js` yang SUDAH jadi dependency DARA (dipakai juga oleh
 * config/database.js untuk mode DB_TYPE=sqlite) — TIDAK perlu paket npm
 * tambahan. Bedanya dari database.js: di sini file-nya BUKAN database DARA
 * sendiri, melainkan berkas .db eksternal yang path-nya diisi admin
 * (field `filePath`, lihat registry.js) — misalnya hasil ekspor dari
 * aplikasi lain yang ditaruh di server yang sama.
 *
 * Dibuka READ-ONLY tiap kali dipanggil (dibaca ke memori, tidak ditulis
 * balik) — cukup untuk test/list/preview, dan lebih aman (tidak mungkin
 * korup file sumber).
 */

import fs from "fs";

let SQL = null;
async function loadSqlJs() {
  if (!SQL) {
    const initSqlJs = (await import("sql.js")).default;
    SQL = await initSqlJs();
  }
  return SQL;
}

function openReadOnly(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Berkas SQLite tidak ditemukan di path: ${filePath || "(kosong)"}`);
  }
  return fs.readFileSync(filePath);
}

async function test(config) {
  const engine = await loadSqlJs();
  const buf = openReadOnly(config.filePath);
  const db = new engine.Database(buf);
  try {
    db.run("SELECT 1");
    return { ok: true };
  } finally {
    db.close();
  }
}

async function listTables(config) {
  const engine = await loadSqlJs();
  const buf = openReadOnly(config.filePath);
  const db = new engine.Database(buf);
  try {
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    const out = [];
    while (stmt.step()) out.push({ name: stmt.getAsObject().name, approxRows: null });
    stmt.free();
    return out;
  } finally {
    db.close();
  }
}

async function previewRows(config, table, limit = 50) {
  const engine = await loadSqlJs();
  const buf = openReadOnly(config.filePath);
  const db = new engine.Database(buf);
  try {
    const ident = '"' + String(table).replace(/"/g, '""') + '"';
    const stmt = db.prepare(`SELECT * FROM ${ident} LIMIT ${Number(limit) || 50}`);
    const columns = stmt.getColumnNames();
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return { columns, rows };
  } finally {
    db.close();
  }
}

export default { key: "sqlite_ext", test, listTables, previewRows };
