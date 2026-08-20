/**
 * Registry Tipe Chart — sumber kebenaran tunggal (single source of truth).
 *
 * Meniru "Show Me" di Tableau: tiap tipe chart mendeklarasikan PRASYARAT
 * berapa dimension & measure yang dibutuhkan. Frontend memakai ini untuk
 * meng-enable/disable pilihan chart sesuai kombinasi yang dipilih user.
 *
 * Field:
 *   id        - id internal (dipakai option builder frontend)
 *   name      - nama tampilan
 *   minDim/maxDim - jumlah dimension (kolom kategori/waktu) yang diizinkan
 *   minMea/maxMea - jumlah measure (nilai numerik teragregasi) yang diizinkan
 *   hint      - penjelasan singkat kapan chart ini cocok
 *
 * Batas engine saat ini: maksimal 2 dimension + 2 measure per chart.
 * Menambah tipe baru = tambah entri di sini + option builder di frontend
 * (client/src/charts/optionBuilders.js). Tidak ada perubahan lain.
 */

// Catatan: minMea 0 berarti chart boleh TANPA measure → engine memakai COUNT(*)
// (hitung baris per kategori). Tipe yang butuh nilai numerik eksplisit
// (scatter/radar/gauge/metric) tetap minMea ≥ 1.
export const CHART_TYPES = [
  { id: "bar",         name: "Bar",             minDim: 1, maxDim: 1, minMea: 0, maxMea: 2,
    hint: "Perbandingan nilai antar kategori (tanpa measure = hitung baris)." },
  { id: "hbar",        name: "Bar Horizontal",  minDim: 1, maxDim: 1, minMea: 0, maxMea: 1,
    hint: "Kategori banyak / label panjang." },
  { id: "stackedbar",  name: "Bar Bertumpuk",   minDim: 2, maxDim: 2, minMea: 0, maxMea: 1,
    hint: "Komposisi sub-kategori dalam tiap kategori." },
  { id: "line",        name: "Line",            minDim: 1, maxDim: 1, minMea: 0, maxMea: 2,
    hint: "Tren nilai (cocok untuk dimensi waktu)." },
  { id: "area",        name: "Area",            minDim: 1, maxDim: 1, minMea: 0, maxMea: 2,
    hint: "Tren dengan penekanan volume." },
  { id: "pie",         name: "Pie",             minDim: 1, maxDim: 1, minMea: 0, maxMea: 1,
    hint: "Proporsi antar sedikit kategori." },
  { id: "donut",       name: "Donut",           minDim: 1, maxDim: 1, minMea: 0, maxMea: 1,
    hint: "Proporsi, varian pie dengan lubang tengah." },
  { id: "scatter",     name: "Scatter",         minDim: 0, maxDim: 1, minMea: 2, maxMea: 2,
    hint: "Korelasi dua ukuran numerik." },
  { id: "radar",       name: "Radar",           minDim: 1, maxDim: 1, minMea: 2, maxMea: 2,
    hint: "Perbandingan multi-ukuran antar kategori." },
  { id: "heatmap",     name: "Heatmap",         minDim: 2, maxDim: 2, minMea: 0, maxMea: 1,
    hint: "Intensitas nilai pada kombinasi dua dimensi." },
  { id: "funnel",      name: "Funnel",          minDim: 1, maxDim: 1, minMea: 0, maxMea: 1,
    hint: "Tahapan proses yang menyusut (mis. pipeline)." },
  { id: "treemap",     name: "Treemap",         minDim: 1, maxDim: 1, minMea: 0, maxMea: 1,
    hint: "Proporsi hirarkis dengan banyak kategori." },
  { id: "gauge",       name: "Gauge",           minDim: 0, maxDim: 0, minMea: 1, maxMea: 1,
    hint: "Satu angka agregat (KPI) dengan jarum." },
  { id: "metric",      name: "KPI / Angka",     minDim: 0, maxDim: 0, minMea: 1, maxMea: 1,
    hint: "Kartu angka besar (KPI) — cocok untuk ringkasan atas dashboard." },
  { id: "table",       name: "Tabel",           minDim: 1, maxDim: 2, minMea: 0, maxMea: 2,
    hint: "Data mentah teragregasi dalam baris & kolom (dukung conditional formatting)." },
  { id: "pivot",       name: "Pivot",           minDim: 2, maxDim: 2, minMea: 1, maxMea: 1,
    hint: "Matriks: dimensi-1 jadi baris, dimensi-2 jadi kolom, sel = nilai." },
];

/** Cek apakah kombinasi (jumlah dim, jumlah measure) memenuhi syarat tipe. */
export function isCombinationValid(type, dimCount, meaCount) {
  return (
    dimCount >= type.minDim && dimCount <= type.maxDim &&
    meaCount >= type.minMea && meaCount <= type.maxMea
  );
}

export default CHART_TYPES;
