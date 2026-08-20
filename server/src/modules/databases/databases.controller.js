/**
 * Databases Controller
 * HTTP request handlers for schema introspection
 */

import { databasesService } from "./databases.service.js";
import { uploadsService } from "../uploads/uploads.service.js";
import { connImportsService } from "../connections/connImports.service.js";
import { dataprepService } from "../dataprep/dataprep.service.js";

/** Boleh akses tabel ini menurut SEMUA sumber ter-ACL (upload/import/dataprep)?
 * Tiap fungsi hanya menolak tabel yang memang dilacaknya sendiri (prefix
 * upl_/conn_/prep_ tidak pernah tumpang tindih), jadi aman digabung AND. */
function canAccessAnyTable(tableName, user) {
  return uploadsService.canAccessTable(tableName, user) &&
    connImportsService.canAccessTable(tableName, user) &&
    dataprepService.canAccessTable(tableName, user);
}

/**
 * Nama tabel SQL hasil upload/import/dataprep sengaja "teknis" (prefix +
 * slug dipangkas + akhiran acak, lihat lib/tableImport.js) — bukan nama
 * yang diketik pengguna, supaya dijamin unik & konsisten sebagai
 * IDENTIFIER SQL. Nama yang diketik pengguna ("nama tampilan") tersimpan
 * TERPISAH di metadata (`name` di dara_uploads/dara_conn_imports/
 * dara_dataprep). Peta ini menyambungkan keduanya supaya UI (dropdown
 * "pilih tabel" di Data Preparation, dst) bisa menampilkan nama yang
 * dikenali pengguna, bukan nama SQL mentah — ditemukan lewat laporan
 * pengguna: nama tabel hasil import "kelihatan aneh" di dropdown.
 */
function buildTableLabelLookup(user) {
  const lookup = new Map();
  const collect = (items) => items.forEach((m) => lookup.set(String(m.tableName).toUpperCase(), m.name));
  collect(uploadsService.list(user));
  collect(connImportsService.list(user));
  collect(dataprepService.list(user));
  return lookup;
}

export const databasesController = {
  /**
   * GET /api/databases/tables
   * List all tables with row counts. Tabel hasil UPLOAD, IMPORT Data
   * Connection, atau Data Preparation disaring ACL: hanya
   * pembuat/admin/dibagikan yang melihatnya; tabel global tetap tampil semua.
   * `label` = nama tampilan yang diketik pengguna saat upload/impor/simpan
   * (kalau ada) — beda dari `name` yang tetap nama tabel SQL asli/teknis,
   * supaya kode lama yang sudah pakai field `name` tidak perlu berubah.
   */
  async listTables(req, res) {
    try {
      const tables = await databasesService.listTables();
      const visible = tables.filter((t) => canAccessAnyTable(t.name, req.user));
      const labelLookup = buildTableLabelLookup(req.user);
      const withLabels = visible.map((t) => ({ ...t, label: labelLookup.get(t.name.toUpperCase()) || null }));
      res.json({ data: withLabels });
    } catch (error) {
      console.error("Error listing tables:", error);
      res.status(500).json({ error: "Failed to list tables. Try again." });
    }
  },

  /**
   * GET /api/databases/tables/:table/schema
   * Get table schema and sample data
   */
  async getSchema(req, res) {
    try {
      const { table } = req.params;

      if (!table || typeof table !== "string" || table.includes(";")) {
        return res.status(400).json({ error: "Invalid table name" });
      }
      // Tabel upload/import/dataprep: hanya boleh diakses pembuat/admin/dibagikan.
      if (!canAccessAnyTable(table, req.user)) {
        return res.status(404).json({ error: "Tabel tidak ditemukan" });
      }

      const schema = await databasesService.getSchema(table, req.query.limit);
      res.json({ data: schema });
    } catch (error) {
      console.error("Error getting schema:", error);
      res.status(500).json({ error: "Failed to load schema. Try again." });
    }
  }
};

export default databasesController;
