/**
 * Tema Warna Dashboard — palet kurasi agar semua chart senada.
 * Dipilih di level dashboard; menimpa warna individual chart demi keseragaman.
 * Menambah tema = tambah satu entri di sini.
 */

export const THEMES = [
  { id: "default", name: "DARA",
    colors: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"] },
  { id: "ocean", name: "Samudra",
    colors: ["#0ea5e9", "#0369a1", "#22d3ee", "#0891b2", "#7dd3fc", "#155e75", "#38bdf8", "#075985"] },
  { id: "sunset", name: "Senja",
    colors: ["#f97316", "#ef4444", "#f59e0b", "#e11d48", "#fb923c", "#be123c", "#fbbf24", "#9f1239"] },
  { id: "forest", name: "Hutan",
    colors: ["#16a34a", "#65a30d", "#0d9488", "#4d7c0f", "#34d399", "#166534", "#a3e635", "#115e59"] },
  { id: "berry", name: "Beri",
    colors: ["#8b5cf6", "#ec4899", "#6366f1", "#d946ef", "#a78bfa", "#be185d", "#c084fc", "#7c3aed"] },
  { id: "mono", name: "Monokrom",
    colors: ["#0f172a", "#334155", "#64748b", "#94a3b8", "#cbd5e1", "#475569", "#1e293b", "#e2e8f0"] },
  { id: "pastel", name: "Pastel",
    colors: ["#93c5fd", "#a7f3d0", "#fde68a", "#fca5a5", "#c4b5fd", "#f9a8d4", "#99f6e4", "#fdba74"] },
  { id: "neon", name: "Neon",
    colors: ["#22d3ee", "#a3e635", "#f472b6", "#facc15", "#818cf8", "#4ade80", "#fb7185", "#2dd4bf"] },
];

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

export default THEMES;
