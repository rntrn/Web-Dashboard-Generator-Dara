import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geoApi } from "../api/geo";

/**
 * MapView — peta Leaflet (tile OpenStreetMap gratis) dengan BANYAK layer.
 * Tiap layer bisa berupa AREA (poligon GeoJSON, choropleth) atau POINT
 * (lat/lng, ukuran ikut nilai). Kontrol layer (nyalakan/matikan) muncul
 * di pojok kanan-atas bila layer > 1.
 *
 * geo = {
 *   layers: [{ id,type,table,name, geoColumn?,latColumn?,lngColumn?,
 *              valueColumn?,labelColumn?,categoryColumn?, color? }],
 *   filterColumn?  // jembatan ke filter dashboard
 * }
 */
const PALETTE = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

/** Normalisasi spec lama (areaTable/pointTable) -> layers[]. */
function toLayers(geo) {
  if (!geo) return [];
  if (Array.isArray(geo.layers)) return geo.layers;
  const out = [];
  if (geo.areaTable) out.push({ id: "area", type: "area", table: geo.areaTable, name: geo.areaTable,
    geoColumn: geo.areaGeoColumn, valueColumn: geo.areaValueColumn, labelColumn: geo.areaLabelColumn });
  if (geo.pointTable) out.push({ id: "point", type: "point", table: geo.pointTable, name: geo.pointTable,
    latColumn: geo.latColumn, lngColumn: geo.lngColumn, valueColumn: geo.pointValueColumn,
    labelColumn: geo.pointLabelColumn, categoryColumn: geo.pointCategoryColumn });
  return out;
}

export default function MapView({ geo, filters = [], height = "100%" }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const controlRef = useRef(null);
  const addedRef = useRef([]);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: false }).setView([-2.5, 118], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap", maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(elRef.current);
    return () => { ro.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let alive = true;

    // bersihkan layer & kontrol lama
    addedRef.current.forEach((l) => map.removeLayer(l));
    addedRef.current = [];
    if (controlRef.current) { map.removeControl(controlRef.current); controlRef.current = null; }

    const layers = toLayers(geo);
    if (layers.length === 0) return;

    const layerFilters = geo.filterColumn
      ? filters.filter((f) => f.column.toLowerCase() === geo.filterColumn.toLowerCase())
      : filters;

    const overlays = {};
    const allBounds = [];

    async function buildArea(L0, color) {
      const { data } = await geoApi.area(L0.table, {
        geoColumn: L0.geoColumn, value: L0.valueColumn, label: L0.labelColumn, filters: layerFilters,
      });
      if (!data.features.length) return null;
      const vals = data.features.map((f) => f.properties.value).filter((v) => Number.isFinite(v));
      const min = Math.min(...vals, 0), max = Math.max(...vals, 1);
      const shade = (v) => {
        if (!Number.isFinite(v)) return color;
        const t = (v - min) / (max - min || 1);
        return `hsl(${hue(color)}, 65%, ${80 - t * 45}%)`;
      };
      const layer = L.geoJSON(data, {
        style: (f) => ({ color, weight: 1, fillColor: shade(f.properties.value), fillOpacity: 0.65 }),
        onEachFeature: (f, lyr) => {
          const p = f.properties;
          lyr.bindPopup(`<b>${p.label ?? ""}</b>${p.value != null ? `<br/>${L0.valueColumn}: ${p.value}` : ""}`);
        },
      });
      try { allBounds.push(layer.getBounds()); } catch { /* */ }
      return layer;
    }

    async function buildPoint(L0, color) {
      const { data } = await geoApi.point(L0.table, {
        lat: L0.latColumn, lng: L0.lngColumn, value: L0.valueColumn,
        label: L0.labelColumn, category: L0.categoryColumn, filters: layerFilters,
      });
      if (!data.features.length) return null;
      const vals = data.features.map((f) => f.properties.value).filter((v) => Number.isFinite(v));
      const maxv = Math.max(...vals, 1);
      const group = L.layerGroup();
      const pts = [];
      for (const f of data.features) {
        const [lng, lat] = f.geometry.coordinates;
        const p = f.properties;
        const r = Number.isFinite(p.value) ? 5 + (p.value / maxv) * 16 : 7;
        const m = L.circleMarker([lat, lng], { radius: r, color, weight: 1, fillColor: color, fillOpacity: 0.75 });
        m.bindPopup(`<b>${p.label ?? ""}</b>${p.category ? `<br/>${p.category}` : ""}${p.value != null ? `<br/>${L0.valueColumn ?? "value"}: ${p.value}` : ""}`);
        group.addLayer(m); pts.push([lat, lng]);
      }
      if (pts.length) allBounds.push(L.latLngBounds(pts));
      return group;
    }

    (async () => {
      for (let i = 0; i < layers.length; i++) {
        const spec = layers[i];
        const color = spec.color || PALETTE[i % PALETTE.length];
        let lyr = null;
        try {
          lyr = spec.type === "area" ? await buildArea(spec, color) : await buildPoint(spec, color);
        } catch { /* layer gagal -> lewati */ }
        if (!alive || !lyr) continue;
        lyr.addTo(map);
        addedRef.current.push(lyr);
        overlays[`${spec.type === "area" ? "▧" : "•"} ${spec.name || spec.table}`] = lyr;
      }
      if (!alive) return;
      // kontrol layer bila lebih dari satu
      if (Object.keys(overlays).length > 1) {
        controlRef.current = L.control.layers(null, overlays, { collapsed: false }).addTo(map);
      }
      // fit ke gabungan bounds
      const bs = allBounds.filter(Boolean);
      if (bs.length) {
        let b = bs[0];
        for (let i = 1; i < bs.length; i++) b = b.extend(bs[i]);
        try { map.fitBounds(b, { padding: [20, 20], maxZoom: 8 }); } catch { /* */ }
      }
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(geo), JSON.stringify(filters)]);

  return <div ref={elRef} style={{ width: "100%", height, minHeight: 180, borderRadius: 12 }} />;
}

/** Ambil hue kasar dari warna hex untuk gradasi choropleth. */
function hue(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return Math.round(h * 60 + 360) % 360;
}
