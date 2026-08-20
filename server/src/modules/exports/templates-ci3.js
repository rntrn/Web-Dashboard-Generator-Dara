/**
 * templates-ci3.js — pembuat isi file untuk bundel Export-to-Script format
 * PHP CODEIGNITER 3. Sama filosofinya dengan templates.js/templates-react.js:
 * fungsi di sini HANYA menghasilkan STRING (isi file); data disuntikkan lewat
 * JSON.stringify/json literal oleh exports.service.js.
 *
 * BUKAN aplikasi CI3 lengkap — cuma potongan file MVC (+ library + helper +
 * public assets) yang harus DIPINDAHKAN MANUAL oleh user ke instalasi CI3
 * mereka sendiri (folder tujuan persis sama dengan struktur di dalam zip —
 * lihat README yang ikut dibuat). DARA sendiri TIDAK menjalankan PHP/CI3,
 * jadi ini murni generator berkas teks.
 *
 * DUA MODE (lihat exports.service.js assembleCi3):
 *   - "hardcode" : data snapshot dibakar ke application/data/dara_snapshot.json,
 *                  dibaca controller lewat library Dara_chart::get_snapshot_rows().
 *                  Tidak butuh model/koneksi DB CI3 sama sekali.
 *   - "db"       : application/models/Dara_dashboard_model.php dibuat, isinya
 *                  SQL live per chart (sama seperti sqlById mode PHP generic)
 *                  dijalankan lewat $this->db->query() — koneksi DB dari
 *                  application/config/database.php MILIK INSTALASI CI3 USER
 *                  SENDIRI (tidak ikut di-generate/ditimpa; user harus arahkan
 *                  ke database MySQL yang sama dengan DARA-nya).
 *
 * Struktur folder di dalam zip PERSIS meniru struktur tujuan CI3 standar
 * (application/controllers, application/models, application/views,
 * application/helpers, application/libraries, application/data, assets/)
 * supaya user tinggal salin folder demi folder.
 */

const CTRL_CLASS = "Dara_dashboard";
const MODEL_CLASS = "Dara_dashboard_model";
const LIB_CLASS = "Dara_chart";
const VIEW_DIR = "dara_dashboard";

/* ============================================================
 * application/controllers/Dara_dashboard.php
 * ============================================================ */
export function ci3Controller(mode) {
  return `<?php
defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * ${CTRL_CLASS}.php — controller hasil ekspor DARA (CodeIgniter 3).
 *
 * HOW TO USE
 *   1. Salin berkas ini ke  application/controllers/${CTRL_CLASS}.php
 *      di instalasi CodeIgniter 3 Anda (path HARUS PERSIS ini, nama file
 *      case-sensitive di banyak server Linux).
 *   2. Pastikan berkas lain dari paket ekspor ini juga sudah disalin
 *      (lihat README.md paket ini untuk daftar lengkap & tujuan tiap file).
 *   3. Buka  http://domain-anda/index.php/${VIEW_DIR.toLowerCase()}  (atau
 *      tambah route kustom — lihat README.md).
 *
 * Alur: library Dara_chart mengumpulkan meta + rows (dari snapshot atau
 * model DB, tergantung mode ekspor) -> dilempar ke view untuk dirender.
 */
class ${CTRL_CLASS} extends CI_Controller {

    public function __construct() {
        parent::__construct();
        $this->load->helper(array('url', 'dara'));
        $this->load->library('${LIB_CLASS.toLowerCase()}');
${mode === "db" ? `        $this->load->model('${MODEL_CLASS}');\n` : ""}    }

    public function index() {
        $meta = $this->${LIB_CLASS.toLowerCase()}->get_meta();
${mode === "db"
      ? `        $rows = $this->${LIB_CLASS.toLowerCase()}->collect_live_rows($meta, $this->${MODEL_CLASS});`
      : `        $rows = $this->${LIB_CLASS.toLowerCase()}->get_snapshot_rows();`}

        $data = array(
            'page_title' => isset($meta['title']) ? $meta['title'] : 'Dashboard',
            'meta_json'  => json_encode($meta, JSON_UNESCAPED_UNICODE),
            'rows_json'  => json_encode($rows, JSON_UNESCAPED_UNICODE),
        );
        $this->load->view('${VIEW_DIR}/index', $data);
    }
}
`;
}

/* ============================================================
 * application/models/Dara_dashboard_model.php — HANYA mode "db"
 * ============================================================ */
export function ci3Model(sqlById) {
  return `<?php
defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * ${MODEL_CLASS}.php — query live per chart (mode DB).
 *
 * HOW TO USE
 *   Salin ke  application/models/${MODEL_CLASS}.php
 *   Memakai koneksi database BAWAAN CodeIgniter Anda sendiri
 *   (application/config/database.php) — PASTIKAN itu menunjuk ke database
 *   MySQL yang SAMA dengan yang dipakai DARA (nama tabel di query di bawah
 *   memakai nama tabel lengkap DARA, mis. dara_data_pegawai).
 *
 * PENTING: alias kolom d1,d2,v1,v2 WAJIB dipertahankan bila Anda mengubah
 * SQL manual — dipakai langsung oleh assets/dara/render.js.
 */
class ${MODEL_CLASS} extends CI_Model {

    /** SQL agregasi per id item chart (dibuat otomatis saat ekspor). */
    private $queries = ${phpAssoc(sqlById)};

    public function get_rows($id) {
        if (!isset($this->queries[$id])) {
            return array();
        }
        try {
            $query = $this->db->query($this->queries[$id]);
            return $query->result_array();
        } catch (Exception $e) {
            log_message('error', 'DARA export query gagal (' . $id . '): ' . $e->getMessage());
            return array();
        }
    }
}
`;
}

/* ============================================================
 * application/libraries/Dara_chart.php
 * ============================================================ */
export function ci3Library(mode) {
  const dbMethod = `
    /**
     * Kumpulkan rows LIVE untuk semua chart di meta, lewat model DB.
     * @param array $meta   hasil get_meta()
     * @param ${MODEL_CLASS} $model  instance model (sudah di-load controller)
     */
    public function collect_live_rows($meta, $model) {
        $rows = array();
        if (empty($meta['steps'])) return $rows;
        foreach ($meta['steps'] as $step) {
            if (empty($step['items'])) continue;
            foreach ($step['items'] as $it) {
                if (isset($it['kind']) && $it['kind'] === 'chart') {
                    $rows[$it['id']] = $model->get_rows($it['id']);
                }
            }
        }
        return $rows;
    }
`;
  const hardcodeMethod = `
    /**
     * Baca snapshot data HARDCODE (mode ekspor "hardcode") dari
     * application/data/dara_snapshot.json — dibuat sekali saat ekspor,
     * TIDAK terhubung ke database mana pun.
     */
    public function get_snapshot_rows() {
        $path = APPPATH . 'data/dara_snapshot.json';
        if (!file_exists($path)) return array();
        $raw = file_get_contents($path);
        $data = json_decode($raw, true);
        return is_array($data) ? $data : array();
    }
`;
  return `<?php
defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * ${LIB_CLASS}.php — library CI3: kumpulkan metadata + data chart hasil
 * ekspor DARA, dipakai ${CTRL_CLASS}.
 *
 * HOW TO USE
 *   Salin ke  application/libraries/${LIB_CLASS}.php
 *   Di-load controller lewat: $this->load->library('${LIB_CLASS.toLowerCase()}');
 *   dipanggil sebagai: $this->${LIB_CLASS.toLowerCase()}->...
 *
 * Paket ini dibuat mode "${mode}" — ${mode === "db"
      ? "get_snapshot_rows() TIDAK dipakai (biarkan ada untuk jaga-jaga bila Anda ingin fallback manual)."
      : "collect_live_rows() TIDAK dipakai (tidak ada model DB di paket mode hardcode)."}
 */
class ${LIB_CLASS} {

    /** Instance CodeIgniter (pola standar akses $this->load dari library). */
    protected $CI;

    public function __construct() {
        $this->CI =& get_instance();
    }

    /** Baca metadata + layout dashboard/story dari application/data/dara_meta.json. */
    public function get_meta() {
        $path = APPPATH . 'data/dara_meta.json';
        if (!file_exists($path)) {
            show_error('Berkas dara_meta.json tidak ditemukan di application/data/. Pastikan sudah disalin dari paket ekspor.');
        }
        $raw = file_get_contents($path);
        return json_decode($raw, true);
    }
${mode === "db" ? dbMethod : hardcodeMethod}}
`;
}

/* ============================================================
 * application/helpers/dara_helper.php
 * ============================================================ */
export function ci3Helper() {
  return `<?php
defined('BASEPATH') OR exit('No direct script access allowed');

/**
 * dara_helper.php — fungsi bantu format angka & escape, dipakai view hasil
 * ekspor DARA.
 *
 * HOW TO USE
 *   Salin ke  application/helpers/dara_helper.php
 *   Di-load controller lewat: $this->load->helper('dara');
 *   (sudah otomatis di-load oleh ${CTRL_CLASS} — lihat konstruktornya)
 *
 * Port dari fungsi fmt() di server/src/modules/exports/templates.js (DARA) —
 * SENGAJA disamakan supaya angka tampil identik lintas format ekspor.
 */

if (!function_exists('dara_fmt')) {
    function dara_fmt($v, $kind = null) {
        if ($v === null || $v === '' || !is_numeric($v)) {
            return $v === null ? '-' : $v;
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
    function dara_esc($s) {
        return htmlspecialchars($s === null ? '' : (string) $s, ENT_QUOTES, 'UTF-8');
    }
}
`;
}

/* ============================================================
 * application/views/dara_dashboard/index.php
 * ============================================================ */
export function ci3View(generator) {
  return `<?php defined('BASEPATH') OR exit('No direct script access allowed'); ?>
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title><?php echo dara_esc($page_title); ?></title>
  <link rel="stylesheet" href="<?php echo base_url('assets/dara/styles.css'); ?>" />
</head>
<body>
  <!-- ${generator} — bundel CodeIgniter 3. HOW TO USE: lihat README.md paket ekspor ini. -->
  <div id="dara-root"></div>
  <script>
    window.DARA = <?php echo $meta_json; ?>;
    window.DARA_ROWS = <?php echo $rows_json; ?>;
  </script>
  <!-- SETTING ECHARTS: default CDN. Offline: unduh echarts.min.js ke assets/dara/ & ganti src di bawah. -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/echarts/5.5.0/echarts.min.js"></script>
  <script src="<?php echo base_url('assets/dara/render.js'); ?>"></script>
</body>
</html>
`;
}

/* ============================================================
 * README.md — instruksi pindah berkas MANUAL (persis diminta user)
 * ============================================================ */
export function ci3Readme(meta, generator, mode) {
  const modelLine = mode === "db"
    ? `| \`application/models/${MODEL_CLASS}.php\` | → \`application/models/${MODEL_CLASS}.php\` di instalasi CI3 Anda | Query SQL live per chart (pakai \`$this->db\` bawaan CI3 — cek \`application/config/database.php\` Anda arahkan ke DB yang sama dengan DARA) |\n`
    : "";
  const dataLine = mode === "db"
    ? `| \`application/data/dara_meta.json\` | → \`application/data/dara_meta.json\` | Metadata + layout saja (data chart datang live dari model, bukan file ini) |\n`
    : `| \`application/data/dara_meta.json\` | → \`application/data/dara_meta.json\` | Metadata + layout |
| \`application/data/dara_snapshot.json\` | → \`application/data/dara_snapshot.json\` | **Data hardcode** (snapshot, ≤1000 baris/chart) |\n`;

  return `# ${meta.title || "Dashboard"} — Bundel CodeIgniter 3 (mode ${mode === "db" ? "DB, live query" : "hardcode"})

Dihasilkan oleh **${generator}**. Ini **BUKAN aplikasi CI3 siap-pasang** —
cuma potongan file MVC (+ library, helper, public assets) yang harus Anda
**pindahkan MANUAL, satu per satu**, ke instalasi CodeIgniter 3 yang SUDAH
ADA di komputer/server Anda. DARA sendiri tidak menjalankan PHP.

## Daftar file & ke mana harus dipindahkan

| Berkas di paket ini | Pindahkan ke (relatif root CI3 Anda) | Fungsi |
|---|---|---|
| \`application/controllers/${CTRL_CLASS}.php\` | → \`application/controllers/${CTRL_CLASS}.php\` | Controller (thin — panggil library) |
| \`application/libraries/${LIB_CLASS}.php\` | → \`application/libraries/${LIB_CLASS}.php\` | Kumpulkan meta + rows |
${modelLine}| \`application/helpers/dara_helper.php\` | → \`application/helpers/dara_helper.php\` | Format angka (\`dara_fmt\`) + escape |
| \`application/views/${VIEW_DIR}/index.php\` | → \`application/views/${VIEW_DIR}/index.php\` | Tampilan (buat folder \`${VIEW_DIR}\` dulu bila belum ada) |
${dataLine}| \`assets/dara/render.js\` | → \`assets/dara/render.js\` (folder \`assets/\` di ROOT CI3, SEJAJAR dengan \`application/\`, BUKAN di dalamnya) | Mesin render grid + chart (ECharts) |
| \`assets/dara/styles.css\` | → \`assets/dara/styles.css\` | Tampilan |

> Kalau instalasi CI3 Anda belum punya folder \`assets/\` di root, buat dulu —
> ini folder publik biasa (bukan bagian \`application/\`), harus bisa diakses
> langsung lewat browser (mis. \`http://domain-anda/assets/dara/styles.css\`).

## Setelah semua file dipindahkan

1. ${mode === "db"
      ? `Buka \`application/config/database.php\` **milik CI3 Anda sendiri** (BUKAN dari paket ini — paket ini tidak menyertakan/menimpa berkas itu) dan pastikan koneksinya menunjuk ke database MySQL yang **sama** dengan yang dipakai DARA (nama tabel di query \`${MODEL_CLASS}.php\` memakai nama tabel lengkap DARA, mis. \`dara_data_pegawai\`).`
      : `Tidak ada setelan database yang diperlukan — data sudah dibakar ke \`application/data/dara_snapshot.json\` saat ekspor.`}
2. Pastikan \`base_url()\` terkonfigurasi benar (\`application/config/config.php\` -> \`$config['base_url']\`), supaya \`assets/dara/...\` termuat.
3. Buka \`http://domain-anda/index.php/${VIEW_DIR.toLowerCase()}\`.
   Mau URL tanpa \`index.php\` atau nama route lain? Tambahkan di
   \`application/config/routes.php\` milik Anda, mis.:
   \`\`\`php
   $route['dashboard'] = '${VIEW_DIR.toLowerCase()}/index';
   \`\`\`

## Catatan
- Alias kolom \`d1, d2, v1, v2\` di SQL (mode DB) WAJIB dipertahankan — dipakai langsung oleh \`assets/dara/render.js\`.
- Peta (Leaflet) tidak ikut diekspor.
- ${mode === "db"
    ? "Kalau nama tabel/skema di database Anda berbeda dari DARA, edit SQL langsung di `application/models/" + MODEL_CLASS + ".php` (properti `$queries`)."
    : "Untuk data LIVE (bukan snapshot), ekspor ulang dari DARA dan pilih mode **\"CodeIgniter 3 (DB)\"** alih-alih mode ini."}
- Struktur ini pakai CodeIgniter **3.x** (\`CI_Controller\`/\`CI_Model\`, bukan namespace CI4).
`;
}

/* ---------- util kecil ---------- */

/** Ubah objek {id: sql} menjadi literal array PHP yang rapi & aman (sama dgn templates.js). */
function phpAssoc(obj) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return "array()";
  const lines = entries.map(([k, v]) => {
    const key = String(k).replace(/'/g, "\\'");
    const val = String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `        '${key}' => '${val}',`;
  });
  return "array(\n" + lines.join("\n") + "\n    )";
}
