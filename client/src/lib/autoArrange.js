/**
 * autoArrange — "Rapikan otomatis" tata letak widget dashboard (#183).
 * Murni & deterministik (mudah diuji). Menyusun ulang item ke grid rapat:
 *  - dikelompokkan per `group` (section) — item satu grup berdampingan,
 *  - dalam grup: isi kiri→kanan, bungkus baris saat melewati `cols`,
 *  - tiap grup mulai di baris baru.
 * Lebar (w) & tinggi (h) tiap item dipertahankan; hanya x/y yang diubah.
 *
 * @param {Array} items  [{ id, w, h, group?, ... }]
 * @param {number} cols  jumlah kolom grid (default 12)
 * @returns {Array} salinan items dengan x/y baru (urutan input dipertahankan)
 */
export function autoArrangeLayout(items, cols = 12) {
  if (!Array.isArray(items) || items.length === 0) return items;

  // Urutan grup mengikuti kemunculan pertama; item tanpa grup → "" (paling atas).
  const order = [];
  const seen = new Set();
  for (const it of items) {
    const g = it.group || "";
    if (!seen.has(g)) { seen.add(g); order.push(g); }
  }

  const posById = new Map();
  let cursorY = 0;

  for (const g of order) {
    const groupItems = items.filter((it) => (it.group || "") === g);
    let x = 0, rowH = 0;
    for (const it of groupItems) {
      const w = Math.min(Math.max(1, it.w || 6), cols);
      const h = Math.max(1, it.h || 8);
      if (x + w > cols) { cursorY += rowH; x = 0; rowH = 0; } // bungkus baris
      posById.set(it.id, { x, y: cursorY });
      x += w;
      rowH = Math.max(rowH, h);
    }
    cursorY += rowH; // grup berikutnya mulai baris baru
  }

  return items.map((it) => {
    const p = posById.get(it.id);
    return p ? { ...it, x: p.x, y: p.y } : it;
  });
}

export default autoArrangeLayout;
