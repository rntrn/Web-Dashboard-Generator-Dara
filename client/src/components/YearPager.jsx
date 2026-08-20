/**
 * YearPager — kontrol filter tahun (chip) + navigasi halaman (pagination).
 * Dipakai di atas daftar chart/dashboard/story tersimpan.
 *
 * Props: years[], year, setYear, page, setPage, totalPages, total
 */
export default function YearPager({ years = [], year, setYear, page, setPage, totalPages = 1, total = 0 }) {
  const chip = (active) =>
    `text-xs px-2.5 py-1 rounded-full border ${active
      ? "bg-teal-600 border-teal-600 text-white"
      : "bg-white border-gray-300 text-gray-600 hover:border-teal-400"}`;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <span className="text-xs text-gray-500">Tahun:</span>
      <button className={chip(year === "all")} onClick={() => { setYear("all"); setPage(1); }}>Semua</button>
      {years.map((y) => (
        <button key={y} className={chip(year === y)} onClick={() => { setYear(y); setPage(1); }}>
          {y || "—"}
        </button>
      ))}

      {totalPages > 1 && (
        <div className="flex items-center gap-1 ml-auto">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}
            className="text-xs px-2 py-1 rounded border border-gray-300 disabled:opacity-30 hover:border-teal-400">‹</button>
          <span className="text-xs text-gray-500">hal {page}/{totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}
            className="text-xs px-2 py-1 rounded border border-gray-300 disabled:opacity-30 hover:border-teal-400">›</button>
        </div>
      )}
      <span className="text-xs text-gray-400">({total} item)</span>
    </div>
  );
}
