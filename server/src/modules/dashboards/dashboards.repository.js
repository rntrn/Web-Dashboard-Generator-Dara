/**
 * Dashboards Repository — akses koleksi "dashboards" di metadata store.
 */

import { metaStore } from "../../config/metaStore.js";

const COLLECTION = "dashboards";

export const dashboardsRepository = {
  list() {
    return metaStore.readAll(COLLECTION);
  },

  get(id) {
    return metaStore.readAll(COLLECTION).find((d) => d.id === id) || null;
  },

  add(dashboard) {
    const items = metaStore.readAll(COLLECTION);
    items.push(dashboard);
    metaStore.writeAll(COLLECTION, items);
    return dashboard;
  },

  update(id, patch) {
    const items = metaStore.readAll(COLLECTION);
    const idx = items.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    items[idx] = { ...items[idx], ...patch, id, updatedAt: new Date().toISOString() };
    metaStore.writeAll(COLLECTION, items);
    return items[idx];
  },

  remove(id) {
    const items = metaStore.readAll(COLLECTION);
    const filtered = items.filter((d) => d.id !== id);
    metaStore.writeAll(COLLECTION, filtered);
    return items.length !== filtered.length;
  },

  /** Tulis ulang seluruh koleksi (dipakai hapus massal). */
  replaceAll(items) {
    metaStore.writeAll(COLLECTION, items);
  },
};

export default dashboardsRepository;
