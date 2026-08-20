/**
 * Charts Repository — akses penyimpanan chart tersimpan (metadata JSON).
 */

import { metaStore } from "../../config/metaStore.js";

const COLLECTION = "charts";

export const chartsRepository = {
  list() {
    return metaStore.readAll(COLLECTION);
  },

  add(chart) {
    const items = metaStore.readAll(COLLECTION);
    items.push(chart);
    metaStore.writeAll(COLLECTION, items);
    return chart;
  },

  remove(id) {
    const items = metaStore.readAll(COLLECTION);
    const filtered = items.filter((c) => c.id !== id);
    metaStore.writeAll(COLLECTION, filtered);
    return items.length !== filtered.length; // true bila ada yang terhapus
  },

  /** Tulis ulang seluruh koleksi (dipakai update). */
  replaceAll(items) {
    metaStore.writeAll(COLLECTION, items);
  },
};

export default chartsRepository;
