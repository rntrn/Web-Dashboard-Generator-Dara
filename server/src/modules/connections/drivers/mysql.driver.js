/**
 * Driver adapter — MySQL / MariaDB.
 * Dipakai untuk koneksi EKSTERNAL (bukan database DARA sendiri — itu
 * urusan config/database.js). Setiap fungsi buka+tutup koneksi sendiri
 * (short-lived), TIDAK memakai pool bersama, karena config bisa beda tiap
 * koneksi tersimpan dan bisa saja hanya dites sesekali.
 */

import mysql from "mysql2/promise";

/** @param {{host,port,database,user,password,ssl}} config */
async function connect(config) {
  return mysql.createConnection({
    host: config.host,
    port: Number(config.port || 3306),
    database: config.database || undefined,
    user: config.user,
    password: config.password || "",
    ssl: config.ssl ? {} : undefined,
    connectTimeout: 8000,
  });
}

async function test(config) {
  const conn = await connect(config);
  try {
    await conn.query("SELECT 1");
    return { ok: true };
  } finally {
    await conn.end();
  }
}

async function listTables(config) {
  const conn = await connect(config);
  try {
    const [rows] = await conn.query(
      `SELECT table_name AS name, table_rows AS approxRows
       FROM information_schema.tables
       WHERE table_schema = ? ORDER BY table_name`,
      [config.database]
    );
    return rows.map((r) => ({ name: r.name, approxRows: r.approxRows ?? null }));
  } finally {
    await conn.end();
  }
}

async function previewRows(config, table, limit = 50) {
  const conn = await connect(config);
  try {
    const ident = "`" + String(table).replace(/`/g, "``") + "`";
    const [rows, fields] = await conn.query(`SELECT * FROM ${ident} LIMIT ?`, [Number(limit) || 50]);
    return { columns: fields.map((f) => f.name), rows };
  } finally {
    await conn.end();
  }
}

export default { key: "mysql", test, listTables, previewRows };
