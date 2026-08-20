import { apiFetch } from "./http.js";
/**
 * Database Schema API Layer
 * Centralized fetch calls for backend communication
 */

export const databasesApi = {
  /**
   * List all database tables
   */
  listTables: async () => {
    const response = await apiFetch("/api/databases/tables");
    if (!response.ok) throw new Error("Failed to fetch tables");
    return response.json();
  },

  /**
   * Get table schema and sample data.
   * @param {number} [limit] jumlah baris contoh (default backend 1000).
   */
  getSchema: async (table, limit) => {
    const q = limit ? `?limit=${encodeURIComponent(limit)}` : "";
    const response = await apiFetch(`/api/databases/tables/${table}/schema${q}`);
    if (!response.ok) throw new Error(`Failed to fetch schema for ${table}`);
    return response.json();
  },

  /**
   * Get usulan chart otomatis untuk sebuah tabel (v0.2.0)
   */
  getSuggestions: async (table) => {
    const response = await apiFetch(`/api/databases/tables/${table}/suggestions`);
    if (!response.ok) throw new Error(`Failed to fetch suggestions for ${table}`);
    return response.json();
  },

  /**
   * Get relasi (JOIN) yang terdeteksi untuk sebuah tabel (v0.4.0)
   */
  getRelations: async (table) => {
    const response = await apiFetch(`/api/databases/tables/${table}/relations`);
    if (!response.ok) throw new Error(`Failed to fetch relations for ${table}`);
    return response.json();
  },

  /**
   * Ambil data teragregasi untuk me-render satu chart usulan (v0.2.0)
   * @param {object} s - { dimension, measure, aggregation }
   */
  getChartData: async (table, s) => {
    const params = new URLSearchParams({
      dimension: s.dimension,
      aggregation: s.aggregation || "COUNT",
      chartType: s.chartType || "bar",
    });
    if (s.measure) params.set("measure", s.measure);
    // Info JOIN lintas-tabel (kalau usulan ini relasional)
    if (s.join) {
      params.set("joinTable", s.join.table);
      params.set("joinLocalKey", s.join.localKey);
      params.set("joinLabel", s.join.label);
      if (s.join.targetKey) params.set("joinTargetKey", s.join.targetKey);
    }
    const response = await apiFetch(`/api/databases/tables/${table}/chart-data?${params}`);
    if (!response.ok) throw new Error("Failed to fetch chart data");
    return response.json();
  }
};

export default databasesApi;
