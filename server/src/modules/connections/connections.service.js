/**
 * Connections Service — CRUD + test/list-tables/preview untuk koneksi
 * database eksternal (menu "Data Connection", sebelum Jelajah Data).
 *
 * Modul ini SENGAJA admin-only (di-gate di connections.routes.js via
 * requireAdmin) — kredensial database eksternal adalah infrastruktur
 * sensitif, sama seperti menu Pengguna/Pengaturan.
 *
 * v0.41.0 — bentuk penyimpanan digeneralisasi dari "cuma field password"
 * (Fase 0) jadi PER-FIELD: field mana pun di driver.fields yang ditandai
 * `secret: true` (password, API key, secret access key, service account
 * JSON, dst — lihat drivers/registry.js) dienkripsi terpisah di
 * `doc.secrets[fieldKey]`. `doc.config` HANYA berisi field non-secret.
 * Field secret TIDAK PERNAH dikirim ke client — toPublic() hanya
 * mengirim daftar KUNCI field yang sudah terisi (`secretFieldsPresent`),
 * supaya form edit tahu field mana yang "sudah ada isinya, kosongkan =
 * tidak berubah" tanpa pernah membocorkan nilainya.
 */

import { metaStore } from "../../config/metaStore.js";
import { encryptSecret, decryptSecret } from "../../lib/secretCipher.js";
import { getAdapter, listDriverDefs, getDriverDef } from "./drivers/registry.js";

const COLLECTION = "connections";

function genId() {
  return `conn_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
}

function secretKeys(driverDef) {
  return (driverDef?.fields || []).filter((f) => f.secret).map((f) => f.key);
}
function fieldKeys(driverDef) {
  return (driverDef?.fields || []).map((f) => f.key);
}

/** Pisahkan body.config mentah jadi { configFields (non-secret), secretValues (secret, mentah belum dienkripsi) }. */
function splitConfig(driverDef, rawConfig = {}) {
  const secKeys = new Set(secretKeys(driverDef));
  const allKeys = new Set(fieldKeys(driverDef));
  const configFields = {};
  const secretValues = {};
  for (const [k, v] of Object.entries(rawConfig || {})) {
    if (!allKeys.has(k)) continue; // buang field yang tidak dikenal skema driver ini
    if (secKeys.has(k)) secretValues[k] = v;
    else configFields[k] = v;
  }
  return { configFields, secretValues };
}

/** Dokumen tersimpan → bentuk aman dikirim ke client (tanpa nilai rahasia apa pun). */
function toPublic(doc) {
  if (!doc) return null;
  const driverDef = getDriverDef(doc.driver);
  const secretFieldsPresent = secretKeys(driverDef).filter((k) => !!(doc.secrets && doc.secrets[k]));
  const { secrets, ...rest } = doc;
  return { ...rest, secretFieldsPresent };
}

/** Rakit config LENGKAP (field rahasia didekripsi) — HANYA dipakai internal (test/list/preview). */
function resolveFullConfig(doc) {
  const driverDef = getDriverDef(doc.driver);
  const full = { ...doc.config };
  for (const k of secretKeys(driverDef)) {
    full[k] = doc.secrets && doc.secrets[k] ? decryptSecret(doc.secrets[k]) : "";
  }
  return full;
}

function findDoc(id) {
  return metaStore.readAll(COLLECTION).find((d) => d.id === id) || null;
}

export const connectionsService = {
  listDrivers() {
    return listDriverDefs();
  },

  list() {
    return metaStore.readAll(COLLECTION).map(toPublic);
  },

  get(id) {
    const doc = findDoc(id);
    return doc ? toPublic(doc) : null;
  },

  /** @param {{nama, driver, config: object}} body — bentuk config ikut skema driver.fields (lihat registry.js) */
  create(body, user) {
    const driverDef = getDriverDef(body.driver);
    if (!driverDef) throw new Error(`Driver "${body.driver}" tidak dikenal.`);

    const { configFields, secretValues } = splitConfig(driverDef, body.config);
    for (const f of driverDef.fields) {
      if (f.required && !f.secret && !String(configFields[f.key] || "").trim())
        throw new Error(`Field "${f.id}" wajib diisi.`);
      if (f.required && f.secret && !String(secretValues[f.key] || "").trim())
        throw new Error(`Field "${f.id}" wajib diisi.`);
    }

    const secrets = {};
    for (const [k, v] of Object.entries(secretValues)) {
      if (String(v || "").trim()) secrets[k] = encryptSecret(v);
    }

    const now = new Date().toISOString();
    const doc = {
      id: genId(),
      nama: String(body.nama || "").trim().slice(0, 150) || `${driverDef.label} baru`,
      driver: body.driver,
      config: configFields,
      secrets,
      status: "BELUM_DITES",
      lastTestedAt: null,
      lastError: null,
      createdBy: user ? { nip: user.nip, nama: user.nama } : null,
      createdAt: now,
      updatedAt: now,
    };

    const items = metaStore.readAll(COLLECTION);
    metaStore.writeAll(COLLECTION, [...items, doc]);
    return toPublic(doc);
  },

  update(id, body) {
    const items = metaStore.readAll(COLLECTION);
    const idx = items.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error("Koneksi tidak ditemukan.");
    const existing = items[idx];

    const driverDef = getDriverDef(body.driver || existing.driver);
    if (!driverDef) throw new Error(`Driver "${body.driver}" tidak dikenal.`);

    const { configFields, secretValues } = splitConfig(driverDef, body.config);

    // Field rahasia: kosong/tidak dikirim = "jangan ubah" (pertahankan yang lama).
    const secrets = { ...existing.secrets };
    for (const [k, v] of Object.entries(secretValues)) {
      if (String(v || "").trim()) secrets[k] = encryptSecret(v);
    }

    const doc = {
      ...existing,
      nama: body.nama != null ? String(body.nama).trim().slice(0, 150) : existing.nama,
      driver: body.driver || existing.driver,
      config: { ...existing.config, ...configFields },
      secrets,
      status: "BELUM_DITES", // config berubah → wajib test ulang sebelum dipakai
      lastTestedAt: null,
      lastError: null,
      updatedAt: new Date().toISOString(),
    };

    items[idx] = doc;
    metaStore.writeAll(COLLECTION, items);
    return toPublic(doc);
  },

  remove(id) {
    const items = metaStore.readAll(COLLECTION);
    const next = items.filter((d) => d.id !== id);
    if (next.length === items.length) return false;
    metaStore.writeAll(COLLECTION, next);
    return true;
  },

  /** Uji koneksi, simpan hasilnya (status AKTIF/GAGAL + pesan error bila ada). */
  async test(id) {
    const doc = findDoc(id);
    if (!doc) throw new Error("Koneksi tidak ditemukan.");
    const adapter = getAdapter(doc.driver);
    const fullConfig = resolveFullConfig(doc);

    const items = metaStore.readAll(COLLECTION);
    const idx = items.findIndex((d) => d.id === id);

    try {
      await adapter.test(fullConfig);
      const updated = { ...doc, status: "AKTIF", lastTestedAt: new Date().toISOString(), lastError: null };
      items[idx] = updated;
      metaStore.writeAll(COLLECTION, items);
      return { ok: true };
    } catch (err) {
      const updated = { ...doc, status: "GAGAL", lastTestedAt: new Date().toISOString(), lastError: err.message.slice(0, 500) };
      items[idx] = updated;
      metaStore.writeAll(COLLECTION, items);
      return { ok: false, error: err.message };
    }
  },

  async listTables(id) {
    const doc = findDoc(id);
    if (!doc) throw new Error("Koneksi tidak ditemukan.");
    const adapter = getAdapter(doc.driver);
    return adapter.listTables(resolveFullConfig(doc));
  },

  /**
   * Rakit adapter + config LENGKAP (secret didekripsi) untuk dipakai modul
   * LAIN dalam server (BUKAN diekspos lewat route langsung) — dipakai
   * `connImports.service.js` (Fase 1: import/materialize baris koneksi jadi
   * tabel `dara_data_conn_*`). Sentralisasi di sini supaya dekripsi secret
   * TETAP di satu tempat, sama seperti test/listTables/previewRows di atas.
   */
  getRuntime(id) {
    const doc = findDoc(id);
    if (!doc) throw new Error("Koneksi tidak ditemukan.");
    return {
      doc,
      driverDef: getDriverDef(doc.driver),
      adapter: getAdapter(doc.driver),
      fullConfig: resolveFullConfig(doc),
    };
  },

  async previewRows(id, table, limit = 50) {
    const doc = findDoc(id);
    if (!doc) throw new Error("Koneksi tidak ditemukan.");
    if (!table || typeof table !== "string") throw new Error("Nama tabel wajib diisi.");
    const adapter = getAdapter(doc.driver);
    return adapter.previewRows(resolveFullConfig(doc), table, Math.min(Number(limit) || 50, 500));
  },
};

export default connectionsService;
