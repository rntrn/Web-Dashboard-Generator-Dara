import { useState } from "react";
import GridLayout, { WidthProvider } from "react-grid-layout";
import "react-grid-layout/css/styles.css";

const Grid = WidthProvider(GridLayout);
const ROW_HEIGHT = 40;

/**
 * ReadOnlyDashboard — render satu dashboard (grid statis) tanpa edit.
 * Dipakai bersama: DashboardPage (lihat), StoryPage (player), StoryViewer (publik).
 * `renderChart(item)` diserahkan pemanggil (konteks login vs publik beda).
 *
 * #183: bila item punya `group`, dashboard dirender sebagai beberapa SECTION
 * yang bisa dilipat (collapsible). Tanpa group → satu grid seperti biasa
 * (kompatibel mundur).
 *
 * Props: dashboard { name, items, theme }, renderChart(item)
 */
export default function ReadOnlyDashboard({ dashboard, renderChart }) {
  if (!dashboard) return null;
  const items = dashboard.items || [];
  const hasGroups = items.some((it) => it.group);

  if (!hasGroups) return <StaticGrid items={items} renderChart={renderChart} />;

  // Kelompokkan per group (urut kemunculan). Item tanpa group → "Umum".
  const order = [];
  const map = new Map();
  for (const it of items) {
    const g = it.group || "Umum";
    if (!map.has(g)) { map.set(g, []); order.push(g); }
    map.get(g).push(it);
  }

  return (
    <div className="space-y-3">
      {order.map((g) => (
        <Section key={g} title={g} items={map.get(g)} renderChart={renderChart} />
      ))}
    </div>
  );
}

/** Satu section collapsible dengan grid statis di dalamnya. */
function Section({ title, items, renderChart }) {
  const [open, setOpen] = useState(true);
  // Normalkan y agar tiap section mulai dari atas (posisi relatif dipertahankan).
  const minY = Math.min(...items.map((it) => it.y || 0));
  const norm = items.map((it) => ({ ...it, y: (it.y || 0) - minY }));

  return (
    <section className="rounded-xl border border-gray-200 bg-white/60">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-gray-50 rounded-t-xl">
        <span className={`text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        <span className="font-semibold text-gray-800">{title}</span>
        <span className="text-xs text-gray-400">({items.length})</span>
      </button>
      {open && (
        <div className="px-2 pb-2">
          <StaticGrid items={norm} renderChart={renderChart} />
        </div>
      )}
    </section>
  );
}

/** Grid statis (tanpa edit) untuk sekumpulan item. */
function StaticGrid({ items, renderChart }) {
  const layout = items.map((it) => ({ i: it.id, x: it.x, y: it.y, w: it.w, h: it.h, static: true }));
  return (
    <Grid layout={layout} cols={12} rowHeight={ROW_HEIGHT}
      isDraggable={false} isResizable={false} compactType={null}>
      {items.map((it) => (
        <div key={it.id}>
          {it.kind === "text" ? (
            <div className="h-full flex items-center px-4 bg-white rounded-xl border border-gray-200">
              <span className="font-bold text-gray-800 text-lg truncate">{it.text}</span>
            </div>
          ) : it.chart ? (
            renderChart(it)
          ) : (
            <div className="p-3 text-xs text-red-400 bg-white rounded-xl border h-full">
              Chart tidak tersedia
            </div>
          )}
        </div>
      ))}
    </Grid>
  );
}
