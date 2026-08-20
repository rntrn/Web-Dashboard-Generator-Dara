import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Konfigurasi Vite untuk DARA Free.
 *
 * Alamat backend dibaca dari client/.env (VITE_API_URL) supaya installer bisa
 * menyesuaikannya bila port server diubah. Bila tidak diisi, dipakai
 * http://localhost:3001.
 *
 * Saat development, permintaan /api diteruskan (proxy) ke backend sehingga
 * browser tetap melihat satu origin — tidak perlu setelan CORS tambahan.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL || "http://localhost:3001";
  const port = Number(env.VITE_PORT || 5173);

  return {
    plugins: [react()],
    // react-grid-layout (via react-draggable) memakai process.env.NODE_ENV.
    // Di browser `process` tidak ada -> "process is not defined" saat drag.
    // Definisikan di sini supaya drag/resize tidak crash.
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env": "{}",
      global: "globalThis",
    },
    server: {
      port,
      proxy: {
        "/api": { target: apiUrl, changeOrigin: true },
      },
    },
  };
});
