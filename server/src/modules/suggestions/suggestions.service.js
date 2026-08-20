/**
 * Suggestions Service — mesin rekomendasi chart.
 *
 * Ide dasar (mirip Metabase): dari profil kolom sebuah tabel, tentukan
 * peran tiap kolom lalu usulkan chart yang masuk akal.
 *
 * Peran kolom:
 *  - dimension (kategori)  : TEXT / cardinality rendah -> sumbu X / grouping
 *  - measure (ukuran)      : numerik non-PK -> nilai yang diagregasi (SUM/AVG)
 *  - temporal (waktu)      : kolom tanggal -> sumbu X untuk tren
 *  - identifier            : primary key / hampir semua unik -> diabaikan
 *
 * Setiap usulan berisi cukup info agar frontend bisa langsung meminta datanya
 * (chartType, dimension, measure, aggregation) + skor confidence untuk urutan.
 */

import { suggestionsRepository } from "./suggestions.repository.js";
import { relationsService } from "../relations/relations.service.js";
import { AGGS } from "../../lib/aggExpr.js";

/** Ambang cardinality agar kolom dianggap kategori (bukan teks bebas). */
const MAX_DIMENSION_CARDINALITY = 20;
/** Ambang agar pie chart layak (irisan tidak terlalu banyak). */
const MAX_PIE_SLICES = 6;
/** Kategori "banyak" → lebih cocok bar horizontal / treemap daripada bar/pie. */
const MANY_CATEGORY = 8;
/** Jumlah usulan maksimum yang dikembalikan (dinaikkan agar variatif — makin
 *  besar sejak usulan multi-parameter/pivot/grouped-bar & COUNT ID ditambah). */
const MAX_SUGGESTIONS = 22;

/** Kolom foreign-key seperti "customer_id", "product_id" (bukan pk sendiri). */
function isForeignKey(name) {
  return /_id$/i.test(name || "");
}

/**
 * Kolom identifier "terlihat seperti ID" walau namanya bukan literal "id"
 * (mis. nip, nik, no_ktp, kode_barang) — cocok dgn heuristik yang sama di
 * client (ChartBuilder.jsx: isIdLike). Dipakai sebagai fallback saat tabel
 * tidak punya PRIMARY KEY eksplisit di database.
 */
function looksLikeId(name) {
  return /(^|_)(id|no|nomor|kode|code)(_|$)/i.test(name || "");
}

/** Tentukan peran tiap kolom dari profilnya. */
function classifyColumns(columns) {
  const dimensions = [];
  const measures = [];
  const temporals = [];

  // Kolom identifier (PK asli, atau kolom PERTAMA di tabel bila namanya juga
  // "terlihat ID" — sesuai kebiasaan penamaan: kolom identitas biasanya di
  // awal). Disimpan terpisah (bukan dimension/measure biasa) supaya bisa
  // dipakai khusus untuk usulan "COUNT DISTINCT id" (lihat suggestForTable
  // bagian 6) — tanpa ini, ID selalu diabaikan total dan tak pernah muncul
  // di usulan chart sama sekali walau "hitung jumlah ID" pertanyaan wajar.
  const idColumn =
    columns.find((c) => c.pk) ||
    (columns[0] && looksLikeId(columns[0].name) ? columns[0] : null);

  for (const col of columns) {
    if (col.temporal) {
      temporals.push(col);
      continue;
    }
    // PK = identifier baris, dilewati sebagai dimension/measure biasa (tapi
    // tetap tersedia lewat idColumn di atas untuk usulan COUNT DISTINCT).
    if (col.pk) continue;

    // Foreign key numerik (mis. product_id) TIDAK dijadikan dimensi mentah.
    // Ditangani terpisah lewat usulan JOIN (label dari tabel referensi) yang
    // jauh lebih bermakna daripada menampilkan ID mentah.
    if (col.numeric && isForeignKey(col.name)) continue;

    if (col.numeric) {
      // Kolom numerik yang hampir semuanya unik jarang berguna diagregasi,
      // tapi tetap bisa jadi measure (mis. line_total). Simpan sebagai measure.
      measures.push(col);
    } else if (col.distinct > 0 && col.distinct <= MAX_DIMENSION_CARDINALITY) {
      // TEXT dengan sedikit nilai unik = kategori.
      dimensions.push(col);
    }
  }

  return { dimensions, measures, temporals, idColumn };
}

export const suggestionsService = {
  /**
   * Hasilkan daftar usulan chart untuk sebuah tabel.
   * @returns {Promise<{table, suggestions: Array}>}
   */
  async suggestForTable(tableName) {
    const profile = await suggestionsRepository.profileTable(tableName);
    const { dimensions, measures, temporals, idColumn } = classifyColumns(profile.columns);

    const suggestions = [];
    const push = (s) => suggestions.push({
      // normalisasi: selalu sediakan array dimensions/measures
      dimensions: s.dimensions || (s.dimension ? [s.dimension] : []),
      measures: s.measures || (s.measure ? [s.measure] : []),
      aggregation: s.aggregation || (s.measures?.length || s.measure ? "SUM" : "COUNT"),
      ...s,
    });

    // Batasi loop agar tidak meledak untuk tabel lebar.
    const dims = dimensions.slice(0, 4);
    const meas = measures.slice(0, 3);

    // 1) KPI / ringkasan: satu angka per measure (metric card) + gauge.
    meas.forEach((m, i) => {
      push({
        chartType: "metric",
        title: `Total ${m.name}`,
        measures: [m.name], aggregation: "SUM",
        confidence: 0.95 - i * 0.01,
        reason: "Ringkasan satu angka (KPI) — cocok di bagian atas dashboard.",
      });
    });
    if (meas[0]) {
      push({
        chartType: "gauge",
        title: `Gauge ${meas[0].name}`,
        measures: [meas[0].name], aggregation: "SUM",
        confidence: 0.5,
        reason: "Satu angka agregat dengan jarum.",
      });
    }

    // 2) Tren waktu: temporal + measure -> line (+ area).
    for (const t of temporals) {
      for (const m of meas) {
        push({ chartType: "line", title: `Tren ${m.name} per ${t.name}`,
          dimensions: [t.name], measures: [m.name], aggregation: "SUM",
          confidence: 0.9, reason: "Kolom waktu + ukuran numerik cocok untuk tren garis." });
        push({ chartType: "area", title: `Area ${m.name} per ${t.name}`,
          dimensions: [t.name], measures: [m.name], aggregation: "SUM",
          confidence: 0.72, reason: "Tren dengan penekanan volume." });
      }
    }

    // 3) Kategori + measure: bar, dan varian sesuai jumlah kategori.
    for (const d of dims) {
      for (const m of meas) {
        push({ chartType: "bar", title: `${m.name} per ${d.name}`,
          dimensions: [d.name], measures: [m.name], aggregation: "SUM",
          confidence: 0.8, reason: "Kategori + ukuran numerik cocok untuk batang." });

        if (d.distinct <= MAX_PIE_SLICES) {
          push({ chartType: "pie", title: `Proporsi ${m.name} per ${d.name}`,
            dimensions: [d.name], measures: [m.name], aggregation: "SUM",
            confidence: 0.62, reason: `Kategori sedikit (${d.distinct}) cocok untuk pie.` });
          push({ chartType: "donut", title: `Donut ${m.name} per ${d.name}`,
            dimensions: [d.name], measures: [m.name], aggregation: "SUM",
            confidence: 0.55, reason: "Proporsi, varian pie dengan lubang tengah." });
          push({ chartType: "funnel", title: `Funnel ${m.name} per ${d.name}`,
            dimensions: [d.name], measures: [m.name], aggregation: "SUM",
            confidence: 0.45, reason: "Tahapan yang menyusut (mis. pipeline)." });
        }
        if (d.distinct > MANY_CATEGORY) {
          push({ chartType: "hbar", title: `${m.name} per ${d.name} (horizontal)`,
            dimensions: [d.name], measures: [m.name], aggregation: "SUM",
            confidence: 0.7, reason: "Kategori banyak / label panjang -> bar horizontal." });
          push({ chartType: "treemap", title: `Treemap ${m.name} per ${d.name}`,
            dimensions: [d.name], measures: [m.name], aggregation: "SUM",
            confidence: 0.5, reason: "Proporsi banyak kategori." });
        }
      }
    }

    // 4) Dua kategori + measure: komposisi (stacked bar), intensitas (heatmap)
    //    & matriks (pivot) — LOOP SEMUA PASANGAN dari dims (dibatasi 3 dimensi
    //    pertama = maks 3 pasangan) supaya usulan multi-parameter lebih
    //    variatif, bukan cuma pasangan pertama seperti sebelumnya.
    if (dims.length >= 2 && meas.length >= 1) {
      const dimsForPairs = dims.slice(0, 3);
      for (let i = 0; i < dimsForPairs.length; i++) {
        for (let j = i + 1; j < dimsForPairs.length; j++) {
          const [d1, d2] = [dimsForPairs[i], dimsForPairs[j]];
          const m = meas[0];
          push({ chartType: "stackedbar", title: `${m.name}: ${d1.name} × ${d2.name}`,
            dimensions: [d1.name, d2.name], measures: [m.name], aggregation: "SUM",
            confidence: 0.65 - i * 0.02, reason: "Komposisi sub-kategori dalam tiap kategori." });
          push({ chartType: "heatmap", title: `Heatmap ${m.name}: ${d1.name} × ${d2.name}`,
            dimensions: [d1.name, d2.name], measures: [m.name], aggregation: "SUM",
            confidence: 0.55 - i * 0.02, reason: "Intensitas nilai pada kombinasi dua dimensi." });
          push({ chartType: "pivot", title: `Matriks ${m.name}: ${d1.name} × ${d2.name}`,
            dimensions: [d1.name, d2.name], measures: [m.name], aggregation: "SUM",
            confidence: 0.5 - i * 0.02,
            reason: `Tabel silang: ${d1.name} sbg baris, ${d2.name} sbg kolom, sel = ${m.name}.` });
        }
      }
    }

    // 5) Dua measure sekaligus: korelasi (scatter), multi-ukuran (radar),
    //    dan bar berkelompok (grouped bar — 1 dimensi, 2 measure berdampingan).
    if (meas.length >= 2) {
      const label = dims[0] ? dims[0].name : null;
      push({ chartType: "scatter", title: `Korelasi ${meas[0].name} vs ${meas[1].name}`,
        dimensions: label ? [label] : [], measures: [meas[0].name, meas[1].name],
        aggregation: "SUM", confidence: 0.6,
        reason: "Hubungan dua ukuran numerik." });
      const lowCard = dims.find((d) => d.distinct <= MANY_CATEGORY);
      if (lowCard) {
        push({ chartType: "radar", title: `Radar ${meas[0].name} & ${meas[1].name} per ${lowCard.name}`,
          dimensions: [lowCard.name], measures: [meas[0].name, meas[1].name], aggregation: "SUM",
          confidence: 0.5, reason: "Perbandingan multi-ukuran antar kategori." });
        push({ chartType: "bar", title: `${meas[0].name} & ${meas[1].name} per ${lowCard.name}`,
          dimensions: [lowCard.name], measures: [meas[0].name, meas[1].name], aggregation: "SUM",
          confidence: 0.58, reason: "Bar berkelompok — bandingkan dua ukuran sekaligus per kategori." });
      }
    }

    // 6) Hitung baris/entitas per kategori — SELALU ditawarkan (bukan cuma
    //    saat tabel tanpa measure numerik sama sekali seperti sebelumnya),
    //    karena "berapa banyak per kategori" tetap pertanyaan valid meski ada
    //    ukuran lain (mis. tabel pegawai punya kolom gaji, tapi "jumlah
    //    pegawai per departemen" tetap berguna). Confidence diturunkan kalau
    //    measure numerik lain sudah ada, supaya usulan SUM tetap di atas.
    //    Ditambah: COUNT DISTINCT kolom identifier (idColumn) bila
    //    terdeteksi — "jumlah <id> unik per kategori", lebih presisi
    //    daripada sekadar jumlah baris kalau ada kemungkinan duplikasi.
    {
      const baseConf = meas.length ? 0.4 : 0.5;
      for (const d of dims) {
        push({ chartType: d.distinct > MANY_CATEGORY ? "hbar" : "bar",
          title: `Jumlah baris per ${d.name}`,
          dimensions: [d.name], measures: [], aggregation: "COUNT",
          confidence: baseConf, reason: "Hitung baris per kategori." });
        if (d.distinct <= MAX_PIE_SLICES) {
          push({ chartType: "pie", title: `Proporsi jumlah per ${d.name}`,
            dimensions: [d.name], measures: [], aggregation: "COUNT",
            confidence: baseConf - 0.08, reason: "Proporsi jumlah baris antar kategori sedikit." });
        }
        if (idColumn) {
          push({ chartType: d.distinct > MANY_CATEGORY ? "hbar" : "bar",
            title: `Jumlah ${idColumn.name} unik per ${d.name}`,
            dimensions: [d.name], measures: [idColumn.name], aggregation: "DISTINCT",
            confidence: baseConf - 0.03,
            reason: `Hitung nilai unik kolom identifier (${idColumn.name}) per kategori — beda dari jumlah baris kalau ada duplikasi.` });
        }
      }
    }

    // 7) Lintas-tabel (JOIN): label dari tabel referensi.
    const relations = await relationsService.resolveRelations(tableName);
    for (const rel of relations) {
      for (const m of meas) {
        if (m.name.toLowerCase() === rel.column.toLowerCase()) continue;
        push({ chartType: "bar", title: `${m.name} per ${rel.refTable}.${rel.labelColumn}`,
          dimensions: [rel.labelColumn], measures: [m.name], aggregation: "SUM",
          confidence: 0.7,
          reason: `Relasi terdeteksi: ${rel.column} -> ${rel.refTable}. JOIN untuk label bermakna.`,
          join: { table: rel.refTable, localKey: rel.column, targetKey: rel.refColumn, label: rel.labelColumn } });
      }
    }

    // Dedupe (tipe + dimensi + measure) lalu urut confidence, batasi MAX.
    const seen = new Set();
    const unique = [];
    for (const s of suggestions.sort((a, b) => b.confidence - a.confidence)) {
      const key = `${s.chartType}|${(s.dimensions || []).join(",")}|${(s.measures || []).join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(s);
    }

    return {
      table: tableName,
      rowCount: profile.rowCount,
      suggestions: unique.slice(0, MAX_SUGGESTIONS),
    };
  },

  /**
   * Ambil DATA untuk satu chart usulan (agregasi sesuai dimension/measure).
   * Dipakai frontend saat me-render preview.
   */
  async getChartData(tableName, { dimension, measure, aggregation, chartType, join }) {
    // Hanya izinkan agregasi yang dikenal (cegah injeksi lewat nama fungsi).
    const agg = AGGS.includes(aggregation) ? aggregation : "COUNT";

    // Line = tren waktu -> urut kronologis (by dimensi); lainnya by nilai.
    const sortBy = chartType === "line" ? "label" : "value";

    // Bila ada info JOIN, ambil data lintas-tabel (label dari tabel referensi).
    if (join && join.table && join.localKey && join.label) {
      return suggestionsRepository.aggregateJoin({
        table: tableName,
        localKey: join.localKey,
        joinTable: join.table,
        targetKey: join.targetKey || "id",
        labelColumn: join.label,
        measure: measure || null,
        aggregation: agg,
        sortBy,
      });
    }

    // Agregasi biasa (satu tabel).
    return suggestionsRepository.aggregate(tableName, {
      dimension,
      measure: measure || null,
      aggregation: agg,
      sortBy,
    });
  },

  /**
   * Data chart generik multi dim/measure (v0.5.0).
   * dims: 0..2 kolom, measures: 0..2 kolom (kosong = COUNT).
   */
  async getChartDataMulti(tableName, { dims, measures, aggregation, chartType, join, filters, dateGrain, topN, calcMeasures }) {
    const agg = AGGS.includes(aggregation) ? aggregation : "SUM";
    // line/area = tren -> urut kronologis; lainnya by nilai.
    const sortBy = ["line", "area"].includes(chartType) ? "label" : "value";

    // Filter global (slicer): hanya terapkan filter yang kolomnya memang ada
    // di tabel ini — chart dari tabel lain tidak error, cuma tidak terfilter.
    let applicable = [];
    if (filters && filters.length) {
      const cols = await suggestionsRepository.getColumns(tableName);
      const colSet = new Set(cols.map((c) => c.name.toUpperCase()));
      applicable = filters.filter((f) => colSet.has(f.column.toUpperCase()));
    }

    return suggestionsRepository.aggregateMulti({
      table: tableName,
      dims: (dims || []).slice(0, 2),
      measures: (measures || []).slice(0, 2),
      aggregation: agg,
      join: join || null,
      sortBy,
      filters: applicable,
      dateGrain: dateGrain || null,   // R2-4: hierarki waktu
      topN: Number(topN) || 0,        // R2-4: batasi jumlah baris
      calcMeasures: Array.isArray(calcMeasures) ? calcMeasures : [], // R2-5
    });
  },
};

export default suggestionsService;
