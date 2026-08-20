/**
 * Databases Service Layer
 * Business logic for schema introspection
 */

import { databasesRepository } from "./databases.repository.js";

// Batas baris review Jelajah Data (B2). Data asli bisa ratusan juta baris,
// jadi ada default kecil + cap keras agar browser tidak crash.
const DEFAULT_SAMPLE = 1000;
const MAX_SAMPLE = 50000;

export const databasesService = {
  /**
   * List all tables with metadata
   */
  async listTables() {
    try {
      const tableNames = await databasesRepository.getTables();
      const tablesWithCounts = await Promise.all(
        tableNames.map(async (name) => ({
          name,
          row_count: await databasesRepository.getTableRowCount(name)
        }))
      );
      return tablesWithCounts;
    } catch (error) {
      throw new Error(`Failed to list tables: ${error.message}`);
    }
  },

  /**
   * Get table schema with sample data.
   * @param {number} limit jumlah baris contoh (default 1000, cap keras MAX_SAMPLE).
   *   Data asli bisa puluhan–ratusan juta baris → JANGAN tarik semua ke browser.
   */
  async getSchema(tableName, limit = DEFAULT_SAMPLE) {
    try {
      const n = Math.min(Math.max(1, Number(limit) || DEFAULT_SAMPLE), MAX_SAMPLE);
      const columns = await databasesRepository.getTableInfo(tableName);
      const count = await databasesRepository.getTableRowCount(tableName);
      const sample = await databasesRepository.getSampleData(tableName, n);

      return {
        columns,
        sample,
        count,                    // total baris tabel (untuk peringatan)
        sampleLimit: n,           // batas yang benar-benar dipakai
        maxSample: MAX_SAMPLE,    // cap keras (frontend menolak "semua" di atas ini)
        truncated: count > sample.length, // ada baris yang tidak ditampilkan
      };
    } catch (error) {
      throw new Error(`Failed to get schema for ${tableName}: ${error.message}`);
    }
  }
};

export default databasesService;
