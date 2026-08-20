/** DARA Express Application (v0.9.0 — semua API di belakang login) */
import express from "express";
import databasesRoutes from "./modules/databases/databases.routes.js";
import suggestionsRoutes from "./modules/suggestions/suggestions.routes.js";
import chartsRoutes from "./modules/charts/charts.routes.js";
import dashboardsRoutes from "./modules/dashboards/dashboards.routes.js";
import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import embedRoutes from "./modules/embed/embed.routes.js";
import storiesRoutes from "./modules/stories/stories.routes.js";
import geoRoutes from "./modules/geo/geo.routes.js";
import uploadsRoutes from "./modules/uploads/uploads.routes.js";
import exportsRoutes from "./modules/exports/exports.routes.js";
import appconfigRoutes from "./modules/appconfig/appconfig.routes.js";
import connectionsRoutes from "./modules/connections/connections.routes.js";
import connImportsRoutes from "./modules/connections/connImports.routes.js";
import dataprepRoutes from "./modules/dataprep/dataprep.routes.js";
import dataprepTablesRoutes from "./modules/dataprep/dataprepTables.routes.js";
import { requireAuth } from "./middlewares/auth.js";
import { securityHeaders, cors } from "./middlewares/security.js";
import { serveStatic } from "./middlewares/staticSite.js";
import { CHART_TYPES } from "./config/chartTypes.js";

const app = express();
app.disable("x-powered-by");

// Keamanan: header dasar + CORS whitelist (dari env CORS_ORIGINS). Dipasang
// paling awal agar berlaku untuk semua respons.
app.use(securityHeaders);
app.use(cors);

// Middleware. Limit dinaikkan agar payload upload CSV/Excel (data ter-parse)
// bisa besar. File mentah dibatasi 100MB di client (MAX_FILE_MB di
// SelectDataSource.jsx) — limit JSON di sini disetel lebih tinggi (130MB)
// karena file diparse jadi JSON [kolom, baris] di browser sebelum dikirim,
// dan representasi JSON sedikit lebih besar dari file mentahnya (tanda
// kutip, koma, kurung array). Upload dibatasi lagi di modul uploads
// (≤100k baris, ≤80 kolom — lihat uploads.service.js).
app.use(express.json({ limit: "130mb" }));

// ---- Publik (tanpa login) ----
// Root: info JSON saat DEV; di produksi (SERVE_STATIC) dilewati agar SPA
// (index.html) yang menyajikan "/".
app.get("/", (req, res, next) => {
  if (process.env.SERVE_STATIC === "true") return next();
  res.json({ app: "DARA — Dashboard & Reporting Generator", version: "0.37.0" });
});
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", app: "DARA v0.37.0" });
});
app.use("/api/auth", authRoutes);
app.use("/api/embed", embedRoutes); // publik, diamankan kunci embed per dashboard
app.use("/api/appconfig", appconfigRoutes); // GET publik (identitas/tema) · PUT admin

// ---- Semua di bawah ini WAJIB login (JWT) ----
app.get("/api/chart-types", requireAuth, (req, res) => {
  res.json({ data: CHART_TYPES });
});
app.use("/api/databases", requireAuth, databasesRoutes);
app.use("/api/databases", requireAuth, suggestionsRoutes);
app.use("/api/charts", requireAuth, chartsRoutes);
app.use("/api/dashboards", requireAuth, dashboardsRoutes);
app.use("/api/stories", requireAuth, storiesRoutes);
app.use("/api/geo", requireAuth, geoRoutes);
app.use("/api/uploads", requireAuth, uploadsRoutes); // upload CSV/Excel (ter-ACL)
app.use("/api/exports", requireAuth, exportsRoutes); // export-to-script (.zip HTML/PHP)
app.use("/api/users", usersRoutes); // requireAuth+requireAdmin di dalam router
app.use("/api/connections", requireAuth, connectionsRoutes); // Data Connection — requireAdmin di dalam router
app.use("/api/conn-imports", requireAuth, connImportsRoutes); // tabel HASIL import Data Connection — ter-ACL (bukan admin-only), lihat connImports.routes.js
app.use("/api/dataprep", requireAuth, dataprepRoutes); // Data Preparation — requireAdmin di dalam router
app.use("/api/dataprep-tables", requireAuth, dataprepTablesRoutes); // tabel HASIL Data Preparation — ter-ACL (bukan admin-only)

// ---- Frontend statis (produksi, SERVE_STATIC=true) + SPA fallback ----
// Dipasang setelah semua /api; permintaan /api tetap dilewati ke 404 di bawah.
serveStatic(app);

// 404 handler (khusus /api; rute non-/api sudah ditangani SPA fallback bila aktif)
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

export default app;
