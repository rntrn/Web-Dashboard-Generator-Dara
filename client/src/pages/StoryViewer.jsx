import { useEffect, useMemo, useState } from "react";
import ReadOnlyDashboard from "../components/ReadOnlyDashboard";
import EChart from "../components/EChart";
import { buildOption } from "../charts/optionBuilders";
import { getTheme } from "../charts/themes";

/**
 * StoryViewer v0.11.0 — halaman publik /story/:id?key=...
 * Presentasi bertahap tanpa login (untuk iframe MANDOR). Chart data diambil
 * lewat endpoint embed story-scoped (kunci story divalidasi server).
 */
export default function StoryViewer() {
  const id = window.location.pathname.split("/")[2] || "";
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const key = query.get("key") || "";

  const [story, setStory] = useState(null);
  const [error, setError] = useState(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    fetch(`/api/embed/story/${id}?key=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((res) => res.error ? setError(res.error) : setStory(res.data))
      .catch(() => setError("Gagal memuat story"));
  }, [id, key]);

  if (error) return <Center>{error}</Center>;
  if (!story) return <Center>Memuat…</Center>;

  const st = story.steps[step];
  const dash = st?.dashboard;
  const palette = dash ? getTheme(dash.theme).colors : null;

  const renderChart = (it) => (
    <StoryChart storyId={id} storyKey={key} dashId={dash.id}
      chart={it.chart} palette={palette} />
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{story.name}</h1>

        {/* Navigasi langkah */}
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-40">← Sebelumnya</button>
          <div className="flex gap-1">
            {story.steps.map((_, i) => (
              <button key={i} onClick={() => setStep(i)}
                className={`w-7 h-7 rounded-full text-xs font-bold ${
                  i === step ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
                }`}>{i + 1}</button>
            ))}
          </div>
          <button onClick={() => setStep(Math.min(story.steps.length - 1, step + 1))}
            disabled={step === story.steps.length - 1}
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm disabled:opacity-40">Berikutnya →</button>
          <span className="text-sm text-gray-500 ml-auto">Langkah {step + 1}/{story.steps.length}</span>
        </div>

        {st && (
          <div>
            {st.title && <h3 className="text-lg font-bold text-gray-900 mb-1">{st.title}</h3>}
            {st.narasi && <p className="text-gray-600 mb-3 whitespace-pre-line">{st.narasi}</p>}
            {dash ? (
              <ReadOnlyDashboard dashboard={dash} renderChart={renderChart} />
            ) : (
              <p className="text-gray-400">Dashboard tidak tersedia.</p>
            )}
          </div>
        )}

        <p className="text-[10px] text-gray-400 mt-2 text-right">DARA</p>
      </div>
    </div>
  );
}

function Center({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <p className="text-gray-500">{children}</p>
    </div>
  );
}

/** Chart dalam story publik: fetch lewat endpoint embed story-scoped. */
function StoryChart({ storyId, storyKey, dashId, chart, palette }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    setRows(null); setErr(null);
    fetch(`/api/embed/story/${storyId}/dashboard/${dashId}/chart/${chart.id}/data?key=${encodeURIComponent(storyKey)}`)
      .then((r) => r.json())
      .then((res) => { if (alive) res.error ? setErr(res.error) : setRows(res.data); })
      .catch(() => alive && setErr("Gagal memuat"));
    return () => { alive = false; };
  }, [storyId, storyKey, dashId, chart.id]);

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm p-3">
      <h4 className="text-sm font-semibold text-gray-900 truncate shrink-0 mb-1">{chart.name}</h4>
      {err && <p className="text-red-500 text-xs py-6 text-center">{err}</p>}
      {!err && !rows && <p className="text-gray-400 text-xs py-6 text-center">Memuat…</p>}
      {!err && rows && rows.length === 0 && <p className="text-gray-400 text-xs py-6 text-center">Tidak ada data.</p>}
      {!err && rows && rows.length > 0 && (
        <div className="flex-1 min-h-0">
          <EChart option={buildOption(chart.chartType, rows, chart, palette)} height="100%" />
        </div>
      )}
    </div>
  );
}
