/**
 * templates-ci4.js — pembuat isi file untuk bundel Export-to-Script format
 * PHP CODEIGNITER 4. Sama filosofinya dengan templates.js/templates-react.js/
 * templates-ci3.js: fungsi di sini HANYA menghasilkan STRING (isi file); data
 * disuntikkan lewat JSON.stringify/literal PHP oleh exports.service.js.
 *
 * BUKAN aplikasi CI4 lengkap — cuma potongan file MVC (+ library + helper +
 * public assets) yang harus DIPINDAHKAN MANUAL oleh user ke instalasi CI4
 * mereka sendiri (folder tujuan persis sama dengan struktur di dalam zip —
 * lihat README yang ikut dibuat). DARA sendiri TIDAK menjalankan PHP/CI4,
 * jadi ini murni generator berkas teks.
 *
 * BEDA PENTING vs templates-ci3.js (JANGAN asal salin pola CI3 ke sini):
 *   - Namespace: CI4 pakai PSR-4 (`App\Controllers`, `App\Models`,
 *     `App\Libraries`), CI3 tidak pakai namespace sama sekali. Class di
 *     autoload otomatis oleh Composer (App\ -> app/) — TIDAK perlu
 *     "$this->load->..." seperti CI3.
 *   - Nama class: PascalCase tanpa underscore ("DaraDashboard", bukan
 *     "Dara_dashboard" ala CI3) — konvensi resmi CI4.
 *   - Webroot: CI4 disajikan dari folder `public/` (app/ ada DI LUAR
 *     webroot). Jadi asset publik (render.js, styles.css) HARUS masuk
 *     `public/assets/dara/...`, BUKAN `assets/...` di root proyek seperti
 *     CI3 — kalau salah taruh, base_url() akan 404. Ini beda struktur
 *     paling gampang salah, ditulis tebal di README hasil generate.
 *   - Data JSON (meta/snapshot) ditaruh di `app/Data/` (folder baru,
 *     lazim dipakai proyek CI4 untuk berkas data non-view/non-config).
 *   - Controller extend `CodeIgniter\Controller` LANGSUNG (bukan
 *     App\Controllers\BaseController) supaya tidak bentrok dengan
 *     kustomisasi BaseController milik user — cukup pakai properti
 *     `protected $helpers = [...]` bawaan core Controller utk autoload
 *     helper, TIDAK perlu daftar service/library terpisah.
 *
 * DUA MODE (lihat exports.service.js assembleCi4) — SAMA seperti CI3:
 *   - "hardcode" : data snapshot dibakar ke app/Data/dara_snapshot.json,
 *                  dibaca lewat DaraChart::getSnapshotRows(). Tidak butuh
 *                  model/koneksi DB CI4 sama sekali.
 *   - "db"       : app/Models/DaraDashboardModel.php dibuat, isinya SQL
 *                  live per chart dijalankan lewat query builder Model
 *                  ($this->db->query()) — koneksi DB dari
 *                  app/Config/Database.php MILIK INSTALASI CI4 USER
 *                  SENDIRI (tidak ikut di-generate/ditimpa; user harus
 *                  arahkan ke database MySQL yang sama dengan DARA-nya).
 */

const CTRL_CLASS = "DaraDashboard";
const MODEL_CLASS = "DaraDashboardModel";
const LIB_CLASS = "DaraChart";
const VIEW_DIR = "dara_dashboard";
const ROUTE_URI = "dara-dashboard";

/* ============================================================
 * app/Controllers/DaraDashboard.php
 * ============================================================ */
export function ci4Controller(mode) {
  return `<?php

namespace App\\Controllers;

use CodeIgniter\\Controller;
use App\\Libraries\\${LIB_CLASS};
${mode === "db" ? `use App\\Models\\${MODEL_CLASS};\n` : ""}
/**
 * ${CTRL_CLASS}.php — controller hasil ekspor DARA (CodeIgniter 4).
 *
 * HOW TO USE
 *   1. Salin berkas ini ke  app/Controllers/${CTRL_CLASS}.php
 *      di instalasi CodeIgniter 4 Anda (path & nama file HARUS PERSIS ini —
 *      Composer autoload PSR-4 mencocokkan namespace App\\Controllers
 *      dengan folder app/Controllers/, jadi tidak perlu "load" manual).
 *   2. Pastikan berkas lain dari paket ekspor ini juga sudah disalin ke
 *      lokasi masing-masing (lihat README.md paket ini untuk peta lengkap
 *      — PERHATIKAN folder public/, beda dari CodeIgniter 3).
 *   3. Tambahkan SATU baris route di app/Config/Routes.php Anda (lihat
 *      README.md), lalu buka  http://domain-anda/${ROUTE_URI}
 *
 * Alur: library ${LIB_CLASS} mengumpulkan meta + rows (dari snapshot atau
 * model DB, tergantung mode ekspor) -> dilempar ke view untuk dirender.
 */
class ${CTRL_CLASS} extends Controller
{
    // Helper 'url' (base_url dsb) & 'dara' (format angka) di-autoload lewat
    // properti ini — bawaan CodeIgniter\\Controller, TIDAK perlu load manual.
    protected $helpers = ['url', 'dara'];

    public function index()
    {
        $lib = new ${LIB_CLASS}();
        $meta = $lib->getMeta();
${mode === "db"
      ? `        $model = new ${MODEL_CLASS}();\n        $rows = $lib->collectLiveRows($meta, $model);`
      : `        $rows = $lib->getSnapshotRows();`}

        return view('${VIEW_DIR}/index', [
            'page_title' => $meta['title'] ?? 'Dashboard',
            'meta_json'  => json_encode($meta, JSON_UNESCAPED_UNICODE),
            'rows_json'  => json_encode($rows, JSON_UNESCAPED_UNICODE),
        ]);
    }
}
`;
}

/* ============================================================
 * app/Models/DaraDashboardModel.php — HANYA mode "db"
 * ============================================================ */
export function ci4Model(sqlById) {
  return `<?php

namespace App\\Models;

use CodeIgniter\\Model;

/**
 * ${MODEL_CLASS}.php — query live per chart (mode DB).
 *
 * HOW TO USE
 *   Salin ke  app/Models/${MODEL_CLASS}.php
 *   Memakai koneksi database BAWAAN CodeIgniter 4 Anda sendiri
 *   (app/Config/Database.php, group 'default') — PASTIKAN itu menunjuk ke
 *   database MySQL yang SAMA dengan yang dipakai DARA (nama tabel di query
 *   di bawah memakai nama tabel lengkap DARA, mis. dara_data_pegawai).
 *
 * PENTING: alias kolom d1,d2,v1,v2 WAJIB dipertahankan bila Anda mengubah
 * SQL manual — dipakai langsung oleh public/assets/dara/render.js.
 */
class ${MODEL_CLASS} extends Model
{
    /** SQL agregasi per id item chart (dibuat otomatis saat ekspor). */
    private array $queries = ${phpAssoc(sqlById)};

    public function getRows(string $id): array
    {
        if (!isset($this->queries[$id])) {
            return [];
        }
        try {
            return $this->db->query($this->queries[$id])->getResultArray();
        } catch (\\Throwable $e) {
            log_message('error', 'DARA export query gagal (' . $id . '): ' . $e->getMessage());
            return [];
        }
    }
}
`;
}

/* ============================================================
 * app/Libraries/DaraChart.php
 * ============================================================ */
export function ci4Library(mode) {
  const dbMethod = `
    /**
     * Kumpulkan rows LIVE untuk semua chart di meta, lewat model DB.
     * @param array $meta   hasil getMeta()
     * @param ${MODEL_CLASS} $model  instance model
     */
    public function collectLiveRows(array $meta, ${MODEL_CLASS} $model): array
    {
        $rows = [];
        if (empty($meta['steps'])) {
            return $rows;
        }
        foreach ($meta['steps'] as $step) {
            if (empty($step['items'])) continue;
            foreach ($step['items'] as $it) {
                if (($it['kind'] ?? null) === 'chart') {
                    $rows[$it['id']] = $model->getRows($it['id']);
                }
            }
        }
        return $rows;
    }
`;
  const hardcodeMethod = `
    /**
     * Baca snapshot data HARDCODE (mode ekspor "hardcode") dari
     * app/Data/dara_snapshot.json — dibuat sekali saat ekspor, TIDAK
     * terhubung ke database mana pun.
     */
    public function getSnapshotRows(): array
    {
        $path = APPPATH . 'Data/dara_snapshot.json';
        if (!is_file($path)) {
            return [];
        }
        $data = json_decode(file_get_contents($path), true);
        return is_array($data) ? $data : [];
    }
`;
  return `<?php

namespace App\\Libraries;
${mode === "db" ? `\nuse App\\Models\\${MODEL_CLASS};\n` : ""}
/**
 * ${LIB_CLASS}.php — kumpulkan metadata + data chart hasil ekspor DARA,
 * dipakai ${CTRL_CLASS}.
 *
 * HOW TO USE
 *   Salin ke  app/Libraries/${LIB_CLASS}.php
 *   TIDAK perlu didaftarkan di mana pun — Composer PSR-4 autoload
 *   (App\\Libraries -> app/Libraries/) sudah otomatis, cukup:
 *     use App\\Libraries\\${LIB_CLASS};
 *     $lib = new ${LIB_CLASS}();
 *
 * Paket ini dibuat mode "${mode}" — ${mode === "db"
      ? "getSnapshotRows() TIDAK dipakai (dibiarkan ada untuk jaga-jaga bila Anda ingin fallback manual)."
      : "collectLiveRows() TIDAK dipakai (tidak ada model DB di paket mode hardcode)."}
 */
class ${LIB_CLASS}
{
    /** Baca metadata + layout dashboard/story dari app/Data/dara_meta.json. */
    public function getMeta(): array
    {
        $path = APPPATH . 'Data/dara_meta.json';
        if (!is_file($path)) {
            throw new \\RuntimeException('Berkas dara_meta.json tidak ditemukan di app/Data/. Pastikan sudah disalin dari paket ekspor.');
        }
        return json_decode(file_get_contents($path), true) ?? [];
    }
${mode === "db" ? dbMethod : hardcodeMethod}}
`;
}

/* ============================================================
 * app/Helpers/dara_helper.php
 * ============================================================ */
export function ci4Helper() {
  return `<?php

/**
 * dara_helper.php — fungsi bantu format angka & escape, dipakai view hasil
 * ekspor DARA.
 *
 * HOW TO USE
 *   Salin ke  app/Helpers/dara_helper.php
 *   Di-autoload lewat properti \`protected $helpers = ['url', 'dara'];\`
 *   di ${CTRL_CLASS} (bawaan core CodeIgniter\\Controller, sudah diatur di
 *   controller hasil ekspor ini — tidak perlu setelan tambahan).
 *
 * Port dari fungsi fmt() di server/src/modules/exports/templates.js (DARA)
 * — SENGAJA disamakan (nama fungsi & isi) dengan versi CI3 supaya angka
 * tampil identik lintas semua format ekspor.
 */

if (!function_exists('dara_fmt')) {
    function dara_fmt($v, ?string $kind = null): string
    {
        if ($v === null || $v === '' || !is_numeric($v)) {
            return $v === null ? '-' : (string) $v;
        }
        $n = (float) $v;
        switch ($kind) {
            case 'currency':
                return 'Rp ' . number_format($n, 0, ',', '.');
            case 'percent':
                return number_format($n, 0, ',', '.') . '%';
            case 'compact':
                if (abs($n) >= 1e9) return number_format($n / 1e9, 1, ',', '.') . ' M';
                if (abs($n) >= 1e6) return number_format($n / 1e6, 1, ',', '.') . ' jt';
                if (abs($n) >= 1e3) return number_format($n / 1e3, 1, ',', '.') . ' rb';
                return (string) $n;
            case 'thousands':
            default:
                return number_format($n, 0, ',', '.');
        }
    }
}

if (!function_exists('dara_esc')) {
    function dara_esc($s): string
    {
        return htmlspecialchars($s === null ? '' : (string) $s, ENT_QUOTES, 'UTF-8');
    }
}
`;
}

/* ============================================================
 * app/Views/dara_dashboard/index.php
 * ============================================================ */
export function ci4View(generator) {
  return `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?= dara_esc($page_title) ?></title>
  <link rel="stylesheet" href="<?= base_url('assets/dara/styles.css') ?>" />
</head>
<body>
  <!-- ${generator} — bundel CodeIgniter 4. HOW TO USE: lihat README.md paket ekspor ini. -->
  <div id="dara-root"></div>
  <script>
    window.DARA = <?= $meta_json ?>;
    window.DARA_ROWS = <?= $rows_json ?>;
  </script>
  <!-- SETTING ECHARTS: default CDN. Offline: unduh echarts.min.js ke public/assets/dara/ & ganti src di bawah. -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js"></script>
  <script src="<?= base_url('assets/dara/render.js') ?>"></script>
</body>
</html>
`;
}

/* ============================================================
 * README.md — instruksi pindah berkas MANUAL (persis pola CI3)
 * ============================================================ */
export function ci4Readme(meta, generator, mode) {
  const modelLine = mode === "db"
    ? `| \`app/Models/${MODEL_CLASS}.php\` | → \`app/Models/${MODEL_CLASS}.php\` di instalasi CI4 Anda | Query SQL live per chart (pakai \`$this->db\` bawaan Model CI4 — cek \`app/Config/Database.php\` Anda arahkan ke DB yang sama dengan DARA) |\n`
    : "";
  const dataLine = mode === "db"
    ? `| \`app/Data/dara_meta.json\` | → \`app/Data/dara_meta.json\` | Metadata + layout saja (data chart datang live dari model, bukan file ini) |\n`
    : `| \`app/Data/dara_meta.json\` | → \`app/Data/dara_meta.json\` | Metadata + layout |
| \`app/Data/dara_snapshot.json\` | → \`app/Data/dara_snapshot.json\` | **Data hardcode** (snapshot, ≤1000 baris/chart) |\n`;

  return `# ${meta.title || "Dashboard"} — Bundel CodeIgniter 4 (mode ${mode === "db" ? "DB, live query" : "hardcode"})

Dihasilkan oleh **${generator}**. Ini **BUKAN aplikasi CI4 siap-pasang** —
cuma potongan file MVC (+ library, helper, public assets) yang harus Anda
**pindahkan MANUAL, satu per satu**, ke instalasi CodeIgniter 4 yang SUDAH
ADA (sudah \`composer install\`) di komputer/server Anda. DARA sendiri
tidak menjalankan PHP.

## ⚠ Beda paling penting dari paket "CodeIgniter 3"

CI4 disajikan dari folder \`public/\` (dokumen root web ada DI DALAM
\`public/\`, folder \`app/\` di LUAR jangkauan browser). Asset publik
(\`render.js\`, \`styles.css\`) di paket ini **HARUS** masuk ke
\`public/assets/dara/...\`, BUKAN \`assets/...\` di root proyek seperti
paket CI3. Kalau salah taruh, halaman akan tampil tapi tanpa gaya/chart
(404 diam-diam di console browser).

## Daftar file & ke mana harus dipindahkan

| Berkas di paket ini | Pindahkan ke (relatif root proyek CI4 Anda) | Fungsi |
|---|---|---|
| \`app/Controllers/${CTRL_CLASS}.php\` | → \`app/Controllers/${CTRL_CLASS}.php\` | Controller (thin — panggil library) |
| \`app/Libraries/${LIB_CLASS}.php\` | → \`app/Libraries/${LIB_CLASS}.php\` | Kumpulkan meta + rows |
${modelLine}| \`app/Helpers/dara_helper.php\` | → \`app/Helpers/dara_helper.php\` | Format angka (\`dara_fmt\`) + escape |
| \`app/Views/${VIEW_DIR}/index.php\` | → \`app/Views/${VIEW_DIR}/index.php\` | Tampilan (buat folder \`${VIEW_DIR}\` dulu bila belum ada) |
${dataLine}| \`public/assets/dara/render.js\` | → **\`public/assets/dara/render.js\`** (folder \`public/\` = webroot CI4) | Mesin render grid + chart (ECharts) |
| \`public/assets/dara/styles.css\` | → **\`public/assets/dara/styles.css\`** | Tampilan |

## Setelah semua file dipindahkan

1. ${mode === "db"
      ? `Buka \`app/Config/Database.php\` **milik CI4 Anda sendiri** (BUKAN dari paket ini — paket ini tidak menyertakan/menimpa berkas itu) dan pastikan group \`'default'\` menunjuk ke database MySQL yang **sama** dengan yang dipakai DARA (nama tabel di query \`${MODEL_CLASS}.php\` memakai nama tabel lengkap DARA, mis. \`dara_data_pegawai\`).`
      : `Tidak ada setelan database yang diperlukan — data sudah dibakar ke \`app/Data/dara_snapshot.json\` saat ekspor.`}
2. Tambahkan SATU baris route di \`app/Config/Routes.php\` milik Anda:
   \`\`\`php
   $routes->get('${ROUTE_URI}', '${CTRL_CLASS}::index');
   \`\`\`
3. Pastikan \`app/Config/App.php\` -> \`public $baseURL\` sudah diisi benar
   (atau \`.env\` -> \`app.baseURL\`), supaya \`base_url()\` menghasilkan URL
   yang tepat ke \`public/assets/dara/...\`.
4. Buka \`http://domain-anda/${ROUTE_URI}\`.

## Catatan

- Namespace \`App\\Controllers\`/\`App\\Models\`/\`App\\Libraries\` mengikuti
  autoload PSR-4 bawaan CI4 (\`App\\\` → \`app/\`) — TIDAK perlu langkah
  registrasi/load manual apa pun selain menyalin berkas ke path yang benar.
- Alias kolom \`d1, d2, v1, v2\` di SQL (mode DB) WAJIB dipertahankan —
  dipakai langsung oleh \`public/assets/dara/render.js\`.
- Peta (Leaflet) tidak ikut diekspor.
- ${mode === "db"
    ? "Kalau nama tabel/skema di database Anda berbeda dari DARA, edit SQL langsung di `app/Models/" + MODEL_CLASS + ".php` (properti `$queries`)."
    : "Untuk data LIVE (bukan snapshot), ekspor ulang dari DARA dan pilih mode **\"CodeIgniter 4 (DB)\"** alih-alih mode ini."}
- Struktur ini pakai CodeIgniter **4.x** (namespace PSR-4, \`CodeIgniter\\Controller\`/\`CodeIgniter\\Model\`) — untuk instalasi CodeIgniter 3.x lama (\`CI_Controller\`, tanpa namespace), pakai format ekspor **"CodeIgniter 3"** yang terpisah.
`;
}

/* ---------- util kecil ---------- */

/** Ubah objek {id: sql} menjadi literal array asosiatif PHP (typed array) yang rapi & aman. */
function phpAssoc(obj) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "[]";
  const lines = entries.map(([k, v]) => {
    const key = String(k).replace(/'/g, "\\'");
    const val = String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `        '${key}' => '${val}',`;
  });
  return "[\n" + lines.join("\n") + "\n    ]";
}
