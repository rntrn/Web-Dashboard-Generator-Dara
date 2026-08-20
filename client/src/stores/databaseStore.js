import { create } from "zustand";

export const useDatabaseStore = create((set) => ({
  tables: [],
  selectedTable: null,
  schema: null,
  suggestions: null,     // usulan chart untuk tabel terpilih (v0.2.0)
  loading: false,
  error: null,

  setTables: (tables) => set({ tables }),
  setSelectedTable: (name) => set({ selectedTable: name }),
  setSchema: (schema) => set({ schema }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error })
}));

export default useDatabaseStore;
