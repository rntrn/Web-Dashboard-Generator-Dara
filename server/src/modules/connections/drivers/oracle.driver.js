/**
 * Driver adapter — Oracle Database.
 *
 * Diaktifkan kembali di v0.41.0 atas permintaan eksplisit (sebelumnya
 * SENGAJA dihapus dari versi free — lihat MIGRATION.md fase 1).
 *
 * Paket npm `oracledb` TIDAK di-bundle default — jalankan
 * `npm install oracledb` di folder server/. BERBEDA dari driver lain:
 * `oracledb` punya DUA mode:
 *   - "thin" (bawaan, murni JS, tanpa Instant Client) — HANYA mendukung
 *     Oracle Database 12.1 ke atas. Konek ke versi lebih lama (mis.
 *     Oracle 11g/11.2) gagal dengan "NJS-138: connections to this
 *     database server version are not supported by node-oracledb in
 *     Thin mode" — dikonfirmasi terjadi di lapangan (lihat CHANGELOG).
 *   - "thick" — butuh Oracle Instant Client terpasang di server (bukan
 *     sekadar `npm install`, unduh manual dari oracle.com, format Basic/
 *     Basic Light, tinggal diekstrak). Mendukung versi Oracle lebih lama
 *     termasuk 11g. Diaktifkan OTOMATIS di sini kalau env
 *     `ORACLE_CLIENT_LIB_DIR` diisi (lihat server/.env.example) — kalau
 *     kosong, tetap jalan di mode thin seperti biasa.
 *
 * CATATAN: belum diuji terhadap Oracle 12.1+ sungguhan di sandbox
 * pengembangan ini (tidak tersedia) — mengikuti dokumentasi resmi paket
 * `oracledb`. Perilaku NJS-138 di atas SUDAH dikonfirmasi oleh pengguna
 * terhadap Oracle 11g sungguhan.
 */

let oracledb = null;
let thickModeDicoba = false; // initOracleClient() cuma boleh dipanggil SEKALI per proses Node

async function loadOracle() {
  if (!oracledb) {
    try {
      oracledb = (await import("oracledb")).default;
    } catch {
      throw new Error('Driver Oracle belum siap: paket npm "oracledb" belum ter-install. Jalankan `npm install oracledb` di folder server/, atau `npm run driver:install -- oracle`.');
    }
  }

  if (!thickModeDicoba) {
    thickModeDicoba = true;
    const libDir = process.env.ORACLE_CLIENT_LIB_DIR;
    if (libDir) {
      try {
        oracledb.initOracleClient({ libDir });
        console.log(`[DARA] Oracle Instant Client (mode thick) aktif dari ORACLE_CLIENT_LIB_DIR="${libDir}" — mendukung Oracle Database versi lama (11g ke bawah).`);
      } catch (err) {
        console.warn(`[DARA] PERINGATAN: gagal mengaktifkan Oracle Instant Client dari ORACLE_CLIENT_LIB_DIR="${libDir}": ${err.message}. Driver Oracle tetap jalan di mode thin (hanya Oracle 12.1+).`);
      }
    }
  }

  return oracledb;
}

/** Ubah NJS-138 (versi server Oracle tidak didukung mode thin) jadi pesan yang menyebut solusinya. */
function perjelasErrorOracle(err) {
  if (/NJS-138/.test(err.message)) {
    return new Error(
      `${err.message} — server Oracle Anda kemungkinan versi LAMA (11g/11.2 ke bawah). Mode "thin" bawaan hanya mendukung Oracle Database 12.1+. Solusi: pasang Oracle Instant Client di server DARA, isi ORACLE_CLIENT_LIB_DIR di server/.env dengan path folder hasil ekstraknya, lalu restart server (mode "thick" mendukung versi lama). Lihat docs/08-data-connection.md.`
    );
  }
  return err;
}

/** config.database di sini diisi "service name" (lihat registry.js). */
async function connect(config) {
  const db = await loadOracle();
  try {
    return await db.getConnection({
      user: config.user,
      password: config.password || "",
      connectString: `${config.host}:${config.port || 1521}/${config.database}`,
    });
  } catch (err) {
    throw perjelasErrorOracle(err);
  }
}

async function test(config) {
  const conn = await connect(config);
  try {
    await conn.execute("SELECT 1 FROM DUAL");
    return { ok: true };
  } finally {
    await conn.close();
  }
}

async function listTables(config) {
  const conn = await connect(config);
  try {
    const r = await conn.execute("SELECT table_name FROM user_tables ORDER BY table_name");
    return r.rows.map((row) => ({ name: row[0], approxRows: null }));
  } finally {
    await conn.close();
  }
}

async function previewRows(config, table, limit = 50) {
  const conn = await connect(config);
  try {
    const ident = '"' + String(table).toUpperCase().replace(/"/g, '""') + '"';
    const r = await conn.execute(
      `SELECT * FROM ${ident} WHERE ROWNUM <= :lim`,
      { lim: Number(limit) || 50 },
      { outFormat: (await loadOracle()).OUT_FORMAT_OBJECT }
    );
    const columns = r.metaData ? r.metaData.map((m) => m.name) : [];
    return { columns, rows: r.rows };
  } finally {
    await conn.close();
  }
}

export default { key: "oracle", test, listTables, previewRows };
