/**
 * Loader — animasi loading informatif dipakai bersama (chart/dashboard/story).
 *
 * - <Spinner/>       : cincin berputar kecil (teal).
 * - <Skeleton/>      : blok abu berkedip (placeholder bentuk konten).
 * - <ChartSkeleton/> : rangka chart (batang naik-turun) + pesan.
 * - <LoadingBox/>    : kotak loading generik + pesan yang bisa diganti.
 */

export function Spinner({ size = 20, className = "" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-teal-500 border-t-transparent ${className}`}
      style={{ width: size, height: size }}
      role="status" aria-label="memuat"
    />
  );
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded bg-gray-200/80 ${className}`} />;
}

/** Rangka chart: beberapa "batang" berkedip dengan tinggi berbeda + pesan. */
export function ChartSkeleton({ message = "Memuat data chart…" }) {
  const bars = [40, 70, 55, 85, 60, 75, 45];
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-3 py-6">
      <div className="flex items-end gap-1.5 h-20">
        {bars.map((h, i) => (
          <div key={i}
            className="w-3 rounded-t bg-teal-200 animate-pulse"
            style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />
        ))}
      </div>
      <p className="text-xs text-gray-400">{message}</p>
    </div>
  );
}

/** Kotak loading generik (mis. saat memuat dashboard/story). */
export function LoadingBox({ message = "Memuat…", className = "" }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 ${className}`}>
      <Spinner size={28} />
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

export default { Spinner, Skeleton, ChartSkeleton, LoadingBox };
