/**
 * Dashboards Service — logika susun dashboard dari chart tersimpan.
 *
 * Sebuah dashboard = nama + daftar item berurutan:
 *   { id, name, items: [{ chartId, width }], createdAt, updatedAt }
 *   width: "full" (1 kolom penuh) | "half" (setengah lebar)
 * Urutan array = urutan tampil (atas ke bawah, half berdampingan).
 */

import crypto from "crypto";
import { dashboardsRepository } from "./dashboards.repository.js";
import { chartsRepository } from "../charts/charts.repository.js";
import { chartsService } from "../charts/charts.service.js";
import { suggestionsService } from "../suggestions/suggestions.service.js";
import { filterAccessible, canManageItem, sanitizeSharedWith } from "../../lib/acl.js";
const SAFE = /^[A-Za-z0-9_]+$/;

// ---- Auto-dashboard (susun otomatis dari usulan chart) ----
const AUTO_MAX_CHARTS = 7;   // total chart dalam dashboard otomatis
const AUTO_MAX_PER_TYPE = 2; // variasi: maks 2 chart per tipe

/** Pilih subset usulan yang variatif untuk dashboard (KPI dulu, lalu ragam). */
function pickForDashboard(suggestions) {
  const out = [];
  const perType = {};
  for (const s of suggestions) {
    const t = s.chartType;
    perType[t] = perType[t] || 0;
    if (perType[t] >= AUTO_MAX_PER_TYPE) continue;
    out.push(s);
    perType[t] += 1;
    if (out.length >= AUTO_MAX_CHARTS) break;
  }
  return out;
}

/**
 * Susun layout grid 12 kolom dari daftar chart tersimpan.
 * - KPI/gauge: kartu kecil (w3×h4), 4 per baris, di atas.
 * - line/area/heatmap/stackedbar: full-width (w12×h8).
 * - lainnya: setengah lebar (w6×h8), 2 per baris.
 * Skema item (id/kind/chartId/x/y/w/h) SAMA dengan editor dashboard manual.
 */
function autoLayout(charts) {
  const items = [];
  const isKpi = (c) => c.chartType === "metric" || c.chartType === "gauge";
  const isFull = (c) => ["line", "area", "heatmap", "stackedbar"].includes(c.chartType);
  const kpis = charts.filter(isKpi);
  const rest = charts.filter((c) => !isKpi(c));

  let y = 0;
  kpis.forEach((c, i) => {
    items.push({ id: `item_${c.id}`, kind: "chart", chartId: c.id,
      x: (i % 4) * 3, y: y + Math.floor(i / 4) * 4, w: 3, h: 4 });
  });
  if (kpis.length) y += Math.ceil(kpis.length / 4) * 4;

  let col = 0;
  for (const c of rest) {
    if (isFull(c)) {
      if (col !== 0) { y += 8; col = 0; }
      items.push({ id: `item_${c.id}`, kind: "chart", chartId: c.id, x: 0, y, w: 12, h: 8 });
      y += 8;
    } else {
      items.push({ id: `item_${c.id}`, kind: "chart", chartId: c.id, x: col * 6, y, w: 6, h: 8 });
      col += 1;
      if (col >= 2) { col = 0; y += 8; }
    }
  }
  return items;
}

/** Angka layout yang aman (integer, dibatasi grid 12 kolom). */
function num(v, def, max = 48) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(Math.round(n), max)) : def;
}

/**
 * Validasi payload dashboard (v0.7.0).
 * Item: { id, kind:"chart"|"text", chartId?, text?, x, y, w, h }
 *   - kind "chart": chartId harus merujuk chart tersimpan
 *   - kind "text" : widget label/judul bebas (maks 500 char)
 *   - x,y,w,h    : posisi & ukuran di grid 12 kolom (drag-drop/resize)
 * Bentuk lama {chartId, width} otomatis dikonversi.
 * filters: [{ id, table, column, label, type }] — definisi slicer global.
 *   type: "select" (equality) | "multiselect" (IN) | "daterange" (BETWEEN).
 */
function validate(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Payload kosong");
  if (!payload.name || !payload.name.trim()) throw new Error("Nama dashboard wajib diisi");

  const rawItems = payload.items || [];
  if (!Array.isArray(rawItems)) throw new Error("items harus array");

  const chartIds = new Set(chartsRepository.list().map((c) => c.id));
  const items = rawItems.map((it, idx) => {
    // Kompatibilitas bentuk lama {chartId, width}
    if (!it.kind && it.chartId) {
      it = { kind: "chart", chartId: it.chartId,
             x: 0, y: idx * 8, w: it.width === "full" ? 12 : 6, h: 8 };
    }

    const base = {
      id: it.id || `item_${idx}_${Date.now()}`,
      kind: it.kind,
      x: num(it.x, 0, 12), y: num(it.y, idx * 8, 400),
      w: num(it.w, 6, 12) || 6, h: num(it.h, 8, 48) || 8,
      // Grup/section (#183): label opsional untuk mengelompokkan widget.
      group: it.group ? String(it.group).slice(0, 60) : null,
    };

    if (it.kind === "chart") {
      if (!it.chartId || !chartIds.has(it.chartId))
        throw new Error(`Chart tidak ditemukan: ${it.chartId}`);
      return { ...base, chartId: it.chartId };
    }
    if (it.kind === "text") {
      const text = String(it.text || "").slice(0, 500);
      if (!text.trim()) throw new Error("Widget teks tidak boleh kosong");
      return { ...base, text };
    }
    throw new Error(`kind item tidak dikenal: ${it.kind}`);
  });

  // Slicer global
  const rawFilters = payload.filters || [];
  if (!Array.isArray(rawFilters)) throw new Error("filters harus array");
  // type slicer (v0.21.0): "select" (default) | "multiselect" | "daterange".
  const FILTER_TYPES = ["select", "multiselect", "daterange"];
  const filters = rawFilters.map((f, i) => {
    if (!SAFE.test(f.table || "") || !SAFE.test(f.column || ""))
      throw new Error("Filter: tabel/kolom tidak valid");
    return {
      id: f.id || `filter_${i}_${Date.now()}`,
      table: f.table,
      column: f.column,
      label: String(f.label || f.column).slice(0, 100),
      type: FILTER_TYPES.includes(f.type) ? f.type : "select",
    };
  });

  // Tema warna (id palet, divalidasi ringan)
  const theme = /^[a-z0-9_-]{0,30}$/i.test(payload.theme || "")
    ? (payload.theme || "default")
    : "default";

  // Tampilan dashboard: warna latar (hex), logo (emoji/teks pendek), subjudul.
  const bgColor = /^#[0-9a-fA-F]{6}$/.test(payload.bgColor || "") ? payload.bgColor : null;
  const logo = String(payload.logo || "").slice(0, 8) || null;
  const subtitle = String(payload.subtitle || "").slice(0, 200) || null;

  return { items, filters, theme, bgColor, logo, subtitle };
}

export const dashboardsService = {
  /** Daftar dashboard yang boleh diakses user (ACL). */
  list(user = null) {
    return user ? filterAccessible(dashboardsRepository.list(), user) : dashboardsRepository.list();
  },

  /** Set daftar NIP yang dibagikan (pemilik/admin). */
  setSharedWith(id, nips, user = null) {
    const dash = dashboardsRepository.get(id);
    if (!dash) throw new Error("Dashboard tidak ditemukan");
    if (!canManageItem(dash, user))
      throw new Error("Hanya pembuat atau admin yang boleh membagikan dashboard ini");
    return dashboardsRepository.update(id, { sharedWith: sanitizeSharedWith(nips) });
  },

  /** Detail dashboard + spesifikasi chart-nya (siap render). */
  getWithCharts(id) {
    const dash = dashboardsRepository.get(id);
    if (!dash) return null;
    const charts = chartsRepository.list();
    return {
      ...dash,
      filters: dash.filters || [],
      items: (dash.items || []).map((it) =>
        it.kind === "text" || it.text
          ? it
          : { ...it, chart: charts.find((c) => c.id === it.chartId) || null }
      ),
    };
  },

  /**
   * Buat dashboard OTOMATIS dari usulan chart sebuah tabel.
   * Alur (menjaga kesinambungan dgn alur manual):
   *   1) suggestionsService → usulan chart (variatif)
   *   2) pilih subset → simpan tiap usulan sbg chart (chartsService.save, ber-createdBy)
   *   3) susun layout grid → dashboardsService.create (item merujuk chartId tsb)
   *
   * @param {string} customName - nama dashboard pilihan user (dari popup nama
   *   di client, lihat SelectDataSource.jsx). Kosong/tidak diisi → nama
   *   bawaan "Auto: <tabel>" (kompatibel dgn perilaku lama).
   * @returns {{dashboard, chartCount}}
   */
  async autoBuild(tableName, user = null, customName = null) {
    if (!SAFE.test(tableName || "")) throw new Error("Nama tabel tidak valid");
    const { suggestions } = await suggestionsService.suggestForTable(tableName);
    if (!suggestions || suggestions.length === 0)
      throw new Error("Tidak ada usulan chart untuk tabel ini");

    // Simpan chart terpilih. Lewati yang gagal validasi (jangan gagalkan semua).
    const picked = pickForDashboard(suggestions);
    const charts = [];
    for (const s of picked) {
      try {
        const saved = chartsService.save({
          name: s.title || `${s.chartType} ${tableName}`,
          table: tableName,
          chartType: s.chartType,
          dimensions: s.dimensions || (s.dimension ? [s.dimension] : []),
          measures: s.measures || (s.measure ? [s.measure] : []),
          aggregation: s.aggregation || "SUM",
          join: s.join || null,
        }, user);
        charts.push(saved);
      } catch (e) {
        console.warn("Auto-dashboard: lewati chart tidak valid:", s.chartType, e.message);
      }
    }
    if (charts.length === 0) throw new Error("Gagal menyusun chart otomatis");

    const items = autoLayout(charts);
    const trimmedCustom = typeof customName === "string" ? customName.trim() : "";
    const dashboard = this.create({
      name: (trimmedCustom || `Auto: ${tableName}`).slice(0, 150),
      subtitle: `Dashboard otomatis (${charts.length} chart) — ${new Date().toLocaleDateString("id-ID")}`,
      items,
      filters: [],
      theme: "default",
    }, user);

    return { dashboard, chartCount: charts.length };
  },

  create(payload, user = null) {
    const { items, filters, theme, bgColor, logo, subtitle } = validate(payload);
    const dash = {
      id: `dash_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      name: payload.name.trim(),
      items,
      filters,
      theme, bgColor, logo, subtitle,
      createdBy: user ? { nip: user.nip, nama: user.nama } : null,
      sharedWith: [], // B1: NIP yang diberi akses oleh pembuat
      createdAt: new Date().toISOString(),
    };
    return dashboardsRepository.add(dash);
  },

  /** Cek hak ubah: pemilik atau admin (legacy tanpa createdBy = admin only). */
  _assertCanModify(id, user) {
    const dash = dashboardsRepository.get(id);
    if (!dash) throw new Error("Dashboard tidak ditemukan");
    const isAdmin = user && user.role === "admin";
    const isOwner = user && dash.createdBy && dash.createdBy.nip === user.nip;
    if (!isAdmin && !isOwner)
      throw new Error("Hanya pembuat atau admin yang boleh mengubah dashboard ini");
    return dash;
  },

  update(id, payload, user = null) {
    this._assertCanModify(id, user);
    const { items, filters, theme, bgColor, logo, subtitle } = validate(payload);
    const updated = dashboardsRepository.update(id, {
      name: payload.name.trim(),
      items,
      filters,
      theme, bgColor, logo, subtitle,
    });
    if (!updated) throw new Error("Dashboard tidak ditemukan");
    return updated;
  },

  remove(id, user = null) {
    this._assertCanModify(id, user);
    return dashboardsRepository.remove(id);
  },

  /** Hapus SEMUA dashboard yang boleh dikelola user (ACL-aware). */
  removeManageable(user = null) {
    const items = dashboardsRepository.list();
    const keep = items.filter((d) => !canManageItem(d, user));
    dashboardsRepository.replaceAll(keep);
    return { deleted: items.length - keep.length };
  },

  /**
   * Buat/putar-ulang kunci embed (v0.10.0). Hanya pemilik/admin.
   * Kunci lama otomatis tidak berlaku (URL lama mati) — itulah cara mencabut akses.
   */
  regenerateEmbedKey(id, user = null) {
    this._assertCanModify(id, user);
    const embedKey = crypto.randomBytes(16).toString("hex");
    const updated = dashboardsRepository.update(id, { embedKey });
    return { id, embedKey: updated.embedKey };
  },

  /** Validasi kunci embed. Return dashboard+charts bila cocok, null bila tidak. */
  getForEmbed(id, key) {
    const dash = dashboardsRepository.get(id);
    if (!dash || !dash.embedKey || !key) return null;
    // Perbandingan constant-time (hindari timing attack sederhana)
    const a = Buffer.from(String(dash.embedKey));
    const b = Buffer.from(String(key));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return this.getWithCharts(id);
  },
};

export default dashboardsService;
