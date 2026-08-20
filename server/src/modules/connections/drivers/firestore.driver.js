/**
 * Driver adapter — Firebase Firestore (via Admin SDK).
 * Paket npm `firebase-admin` TIDAK di-bundle default — jalankan
 * `npm install firebase-admin` di folder server/.
 *
 * Kredensial BEDA BENTUK dari driver lain: bukan host/user/password,
 * tapi `projectId` + isi lengkap file JSON service account (field
 * `serviceAccountJson`, dienkripsi seperti password — lihat registry.js).
 *
 * Tiap panggilan membuat Firebase App terpisah dengan nama unik lalu
 * dibongkar lagi di `finally` — supaya beberapa koneksi Firestore
 * tersimpan tidak bentrok nama App di proses server yang sama.
 *
 * CATATAN: belum diuji terhadap Firestore sungguhan di sandbox
 * pengembangan ini (tidak tersedia) — mengikuti dokumentasi resmi
 * `firebase-admin`. Verifikasi manual dianjurkan saat pertama kali
 * dipakai produksi.
 */

let admin = null;
async function loadAdmin() {
  if (admin) return admin;
  try {
    admin = (await import("firebase-admin")).default;
  } catch {
    throw new Error('Driver Firestore belum siap: paket npm "firebase-admin" belum ter-install. Jalankan `npm install firebase-admin` di folder server/, atau `npm run driver:install -- firestore`.');
  }
  return admin;
}

async function openApp(config) {
  const fbAdmin = await loadAdmin();
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(config.serviceAccountJson);
  } catch {
    throw new Error("Service account JSON tidak valid (gagal di-parse). Pastikan isi field ini adalah isi LENGKAP file JSON dari Firebase Console.");
  }
  const appName = `dara-conn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const app = fbAdmin.initializeApp(
    { credential: fbAdmin.credential.cert(serviceAccount), projectId: config.projectId },
    appName
  );
  return app;
}

async function test(config) {
  const app = await openApp(config);
  try {
    await app.firestore().listCollections();
    return { ok: true };
  } finally {
    await app.delete();
  }
}

async function listTables(config) {
  const app = await openApp(config);
  try {
    const cols = await app.firestore().listCollections();
    return cols.map((c) => ({ name: c.id, approxRows: null }));
  } finally {
    await app.delete();
  }
}

async function previewRows(config, table, limit = 50) {
  const app = await openApp(config);
  try {
    const snap = await app.firestore().collection(table).limit(Number(limit) || 50).get();
    const rows = snap.docs.map((d) => {
      const data = d.data();
      const flat = { _id: d.id };
      for (const [k, v] of Object.entries(data)) flat[k] = (v !== null && typeof v === "object") ? JSON.stringify(v) : v;
      return flat;
    });
    const columnSet = new Set();
    for (const row of rows) for (const k of Object.keys(row)) columnSet.add(k);
    return { columns: [...columnSet], rows };
  } finally {
    await app.delete();
  }
}

export default { key: "firestore", test, listTables, previewRows };
