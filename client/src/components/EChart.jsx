import { useEffect, useRef } from "react";
import * as echarts from "echarts";

/**
 * EChart — wrapper React untuk Apache ECharts.
 * Memakai ResizeObserver: chart otomatis menyesuaikan saat kontainer
 * berubah ukuran (mis. widget dashboard di-resize). Ini yang membuat
 * dashboard terasa "hidup" saat drag/resize.
 */
export default function EChart({ option, height = "100%", onClick = null }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  // Simpan handler terbaru di ref supaya listener 'click' (didaftarkan sekali)
  // selalu memanggil versi terkini tanpa perlu re-register.
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    if (!ref.current) return;
    chartRef.current = echarts.init(ref.current);

    // Cross-filter: teruskan klik elemen (bar/pie/line) ke parent bila ada.
    chartRef.current.on("click", (params) => {
      if (clickRef.current) clickRef.current(params);
    });

    // Ikuti ukuran kontainer secara real-time (bukan cuma window resize)
    const ro = new ResizeObserver(() => {
      if (chartRef.current) chartRef.current.resize();
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chartRef.current && chartRef.current.dispose();
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) {
      chartRef.current.setOption(option, true); // notMerge: ganti tipe bersih
    }
  }, [option]);

  return (
    <div ref={ref}
      style={{ width: "100%", height, minHeight: 120, cursor: onClick ? "pointer" : "default" }} />
  );
}
