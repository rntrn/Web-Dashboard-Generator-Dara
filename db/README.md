# db/ — Database DARA Free

Semua yang berhubungan dengan database ada di folder ini. Tidak ada DDL yang
tersebar di tempat lain.

```
db/
├── schema/
│   ├── 001_core.sql            tabel metadata DARA (dara_*)
│   ├── 002_sample_tables.sql   tabel data contoh (dara_data_*), termasuk
│   │                            kolom akun di dara_data_pegawai
│   ├── 006_data_provinsi.sql   tabel data contoh: layer AREA peta
│   ├── 008_connections.sql     dara_connections — Data Connection (Fase 0)
│   ├── 009_conn_imports.sql    dara_conn_imports — import/materialize (Fase 1)
│   └── 010_dataprep.sql        dara_dataprep — Data Preparation (Fase 2)
├── seed/
│   ├── 003_seed_core.sql       peran, admin bawaan, relasi, konfigurasi
│   ├── 004_seed_sample.sql     240 penjualan, 40 pegawai (HR), 15 lokasi
│   ├── 005_seed_accounts.sql   akun contoh (John Doe, Jane Doe) — SENGAJA
│   │                            bernomor setelah 004 karena file itu
│   │                            men-TRUNCATE dara_data_pegawai
│   └── 007_seed_provinsi.sql   10 provinsi + poligon sederhana untuk layer
│                                AREA peta (lihat catatan di berkasnya)
├── tools/
│   └── generate-sample.mjs     membuat ulang 004_seed_sample.sql (TIDAK
│                                mencakup 007_seed_provinsi.sql — datanya
│                                faktual/tetap, ditulis manual)
└── README.md                   ← Anda di sini
```

> Urutan jalan migrasi ditentukan murni oleh **nomor versi** (awalan nama
> berkas), bukan folder — `migrate.mjs` menggabungkan `schema/` + `seed/`
> lalu mengurutkan ulang berdasarkan nomor itu. Jadi `006` (schema) tetap
> jalan sebelum `007` (seed) walau ada di folder berbeda. Nomor versi harus
> unik secara global di kedua folder.

---

## Dua jenis tabel

| Awalan | Isi | Boleh dilihat pengguna? |
|---|---|---|
| `dara_*` | metadata DARA: chart, dashboard, pengguna, log | tidak — disembunyikan dari UI |
| `dara_data_*` | sumber data Anda | ya — muncul di menu Jelajah Data |

Pemisahan ini diatur oleh `DB_TABLE_PREFIX` di `server/.env` (bawaan
`dara_data_`). Tabel di luar kedua awalan itu tidak akan terlihat maupun
tersentuh DARA.

---

## Pola "dokumen + proyeksi"

Tabel metadata punya kolom `doc JSON` **plus** beberapa kolom biasa:

```sql
SELECT id, nama, chart_type, owner_nip FROM dara_charts;  -- proyeksi: enak dibaca
SELECT doc FROM dara_charts WHERE id = 'abc';             -- yang dibaca aplikasi
```

- `doc` adalah **sumber kebenaran** — dokumen JSON utuh dari aplikasi.
- Kolom lain adalah **salinan** dari isi `doc`, ditulis bersamaan, agar bisa
  di-query, di-index, dan dipasangi foreign key.

> ⚠️ Meng-`UPDATE` kolom proyeksi lewat SQL **tidak** mengubah perilaku
> aplikasi. Yang dibaca aplikasi adalah `doc`. Kalau harus menyunting metadata
> langsung dari SQL, ubah `doc` (dan proyeksinya biar konsisten), lalu restart
> server — metadata dimuat saat boot.

---

## Kamus data — tabel metadata

### `dara_schema_migrations`
Mencatat berkas SQL mana yang sudah dijalankan. Ini yang membuat
`npm run db:migrate` aman diulang.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `version` | VARCHAR(20) PK | angka di awal nama berkas, mis. `001` |
| `name` | VARCHAR(120) | nama berkas |
| `checksum` | CHAR(64) | sha256 isi berkas saat dijalankan |
| `applied_at` | DATETIME | waktu penerapan |

### `dara_settings`
Pengaturan global. **Selalu satu baris**, `id = 1` (dijaga `CHECK`).

| Kolom | Tipe | Keterangan |
|---|---|---|
| `admin_user` | VARCHAR(50) | username admin lokal |
| `admin_hash` | VARCHAR(100) | bcrypt password admin |
| `app_name` | VARCHAR(100) | nama aplikasi di antarmuka |
| `dev_mode` | TINYINT(1) | 1 = tampilkan detail galat; matikan di produksi |
| `acl_enabled` | TINYINT(1) | 1 = kepemilikan per item ditegakkan |
| `upload_enabled` | TINYINT(1) | 1 = fitur upload aktif |
| `doc` | JSON | dokumen settings utuh |

### `dara_roles`
Peran dan daftar izinnya. Diisi seed dengan `admin`, `editor`, `viewer`.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `kode` | VARCHAR(30) PK | pengenal peran |
| `permissions` | JSON | array izin, `["*"]` untuk admin |
| `is_system` | TINYINT(1) | 1 = bawaan, jangan dihapus |

> Catatan: kolom `permissions` **belum** ditegakkan oleh kode — pemeriksaan
> masih berbasis `role === "admin"`.

### Tidak ada `dara_users`

Berbeda dari versi sebelumnya, **tidak ada tabel metadata terpisah untuk
pengguna aplikasi**. Identitas pengguna hidup di `dara_data_pegawai` (lihat
bagian kamus data tabel contoh di bawah) — satu tabel untuk data HR *dan*
akun login. Alasan dan detail teknisnya ada di komentar
`db/schema/001_core.sql` bagian 3, dan di
`server/src/modules/users/users.repository.js`.

### `dara_charts`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | VARCHAR(64) PK | id acak dari aplikasi |
| `nama`, `chart_type`, `table_name` | VARCHAR | proyeksi |
| `owner_nip` | VARCHAR(30) | pemilik |
| `shared_with` | JSON | array NIP yang diberi akses baca |
| `doc` | JSON | spesifikasi chart utuh |

Isi `doc`: `{ id, name, table, chartType, dimensions[], measures[],
aggregation, join, filters, format, createdBy, sharedWith, createdAt,
updatedAt }`

### `dara_dashboards`

| Kolom | Tipe | Keterangan |
|---|---|---|
| `id` | VARCHAR(64) PK | |
| `nama`, `subjudul`, `tema` | VARCHAR | proyeksi |
| `jumlah_item` | INT | banyak widget dalam grid |
| `status` | ENUM | `DRAFT` / `LIVE` / `ARSIP` |
| `doc` | JSON | termasuk layout grid & slicer |

Isi `doc.items`: `[{ id, kind, chartId, x, y, w, h }]` — grid 12 kolom.

### `dara_stories`
Rangkaian dashboard jadi presentasi. `doc.steps`:
`[{ id, dashboardId, title, narasi }]`.

### `dara_embeds`
Kunci akses viewer publik per dashboard.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `dashboard_id` | VARCHAR(64) FK | → `dara_dashboards.id`, ON DELETE CASCADE |
| `embed_key` | CHAR(32) UNIQUE | kunci pada URL |
| `expires_at` | DATETIME | NULL = tidak kedaluwarsa |

### `dara_relations`
Relasi antar tabel data untuk chart lintas-tabel. DARA mendeteksi relasi
otomatis lewat konvensi `*_id`; tabel ini untuk yang tidak mengikuti konvensi.

```sql
INSERT INTO dara_relations (from_table, from_column, to_table, to_column, join_type)
VALUES ('dara_data_transaksi', 'kd_pelanggan', 'dara_data_pelanggan', 'kode', 'LEFT');
```

### `dara_uploads`
Riwayat impor CSV/Excel: nama berkas, tabel hasil, jumlah baris berhasil/gagal,
pemilik.

### `dara_connections`
Koneksi ke database eksternal (menu Data Connection, admin-only) —
`008_connections.sql`. `doc` berisi `{config:{host,port,database,user,ssl,
...field lain sesuai driver}, secrets:{<fieldKey>: secretEnc}, status,
lastTestedAt, lastError, createdBy}`. Field yang ditandai `secret: true` di
skema driver (lihat `server/src/modules/connections/drivers/registry.js`)
dienkripsi AES-256-GCM PER-FIELD — bukan cuma kolom `password` — dan TIDAK
PERNAH tersimpan/terkirim plaintext. Lihat `docs/08-data-connection.md`.

### `dara_conn_imports`
Metadata tabel hasil **import/materialize** dari `dara_connections` (Fase 1,
`009_conn_imports.sql`) — pola identik `dara_uploads`, sumbernya beda
(koneksi eksternal, bukan file). Kolom `connection_id`/`source_table`
melacak asal datanya; `table_name` menunjuk ke tabel data sesungguhnya
(`dara_data_conn_*`, dibuat dinamis oleh
`server/src/modules/connections/connImports.service.js`). Baris dibatasi
100.000 per import (sekali tarik, BUKAN sinkronisasi berkala — lihat
docs/08-data-connection.md).

### `dara_dataprep`
Metadata tabel hasil **Data Preparation** (Fase 2, `010_dataprep.sql`) —
pola identik `dara_uploads`/`dara_conn_imports`, tapi sumbernya tabel
`dara_data_*` yang SUDAH ada di DARA sendiri (bukan file/koneksi eksternal).
Kolom `source_table`/`join_table` melacak asal datanya, `doc.recipe`
menyimpan definisi lengkap (kolom dipilih, rename, tipe, JOIN) untuk
transparansi/audit. `table_name` menunjuk ke tabel hasil sesungguhnya
(`dara_data_prep_*`, dibuat via `CREATE TABLE ... AS SELECT` oleh
`server/src/modules/dataprep/dataprep.service.js`). Baris dibatasi 100.000,
kolom dibatasi 100 per recipe — lihat docs/08-data-connection.md.

### `dara_activity`
Jejak audit, 2.000 entri terbaru (dipangkas aplikasi). Kolom `aksi` berisi
`login`, `create`, `update`, `delete`, `share`.

### `dara_appconfig`
Konfigurasi bebas berbentuk key–value, dikelompokkan `scope`:

| scope | contoh key |
|---|---|
| `brand` | `app_name`, `tagline` |
| `theme` | `palette`, `accent` |
| `i18n` | `default_locale` |
| `geo` | `default_center` |
| `chart` | `max_rows` |

---

## Kamus data — tabel contoh

Keempat tabel ini sengaja dipilih supaya semua fitur DARA bisa dicoba.

### `dara_data_unit` (8 baris)
Tabel dimensi. Pasangan JOIN untuk `dara_data_pegawai`.

`id`, `kode`, `nama`, `wilayah`

### `dara_data_penjualan` (240 baris, Jan–Des 2025)
Tabel fakta utama. Punya kolom tanggal, beberapa dimensi kategori, dan
kolom angka — bahan ideal untuk usulan chart otomatis.

`id`, `tanggal`, `kota`, `provinsi`, `kategori`, `produk`, `kanal`, `qty`,
`harga_satuan`, `total`, `sales_rep`

Nilainya naik tipis tiap bulan dengan puncak November–Desember, supaya grafik
garis memperlihatkan tren yang masuk akal.

### `dara_data_pegawai` (40 baris HR + akun aplikasi)

`unit_id` mengikuti konvensi `*_id`, jadi relasi ke `dara_data_unit` terdeteksi
otomatis oleh fitur chart lintas-tabel.

**Tabel ini istimewa: sekaligus jadi identitas pengguna aplikasi.** Bukan
sekadar tabel contoh — DARA membaca tabel ini untuk autentikasi. Lihat
"Tidak ada `dara_users`" di atas untuk alasannya.

| Kolom | Tipe | Keterangan |
|---|---|---|
| `nip` | VARCHAR(30) UNIQUE | identitas unik; identifier login alternatif |
| `nama` | VARCHAR(120) | |
| `email` | VARCHAR(150) UNIQUE, NULL | identifier login alternatif; NULL bila bukan akun |
| `password_hash` | VARCHAR(100), NULL | bcrypt. **JANGAN PERNAH** diekspos lewat API data generik — disaring di `databases.repository.js` |
| `role_kode` | VARCHAR(30) FK | → `dara_roles.kode`, berlaku hanya bila `is_user=1` |
| `status` | ENUM | `AKTIF` / `NONAKTIF` |
| `is_user` | TINYINT(1) | 1 = baris ini akun aplikasi (bisa login), 0 = data HR murni |
| `unit_id`..`gaji_pokok` | NULL-able | kolom HR; NULL bila akun ini bukan pegawai struktural |

40 baris data contoh (Ayu Setiawan, dst.) datang dengan `is_user=0` —
murni data HR, bukan akun. Dua akun contoh (`is_user=1`) diseed terpisah di
[`005_seed_accounts.sql`](seed/005_seed_accounts.sql) — lihat
[`docs/06-kontribusi.md`](../docs/06-kontribusi.md) bila menambah kolom baru
di tabel ini.

**Mengelola pengguna:** lewat menu Pengguna di aplikasi (`/api/users`), BUKAN
`UPDATE`/`DELETE` manual di SQL — logikanya (promosi pegawai HR jadi akun,
proteksi data HR saat akses dicabut) ada di
`server/src/modules/users/users.repository.js`.

### `dara_data_lokasi` (15 baris)
Untuk fitur peta, layer **titik/marker**. Kolom `lat`/`lon` dikenali otomatis
oleh `geo.service.js`. Kolom `provinsi` di sini cuma teks biasa (untuk
filter/pengelompokan) — **bukan** yang membuat layer area, walau namanya
mirip. Layer area ada di tabel terpisah, lihat di bawah.

`id`, `nama`, `jenis`, `provinsi`, `kota`, `lat`, `lon`, `kapasitas`

### `dara_data_provinsi` (10 baris)
Untuk fitur peta, layer **area/choropleth**. Kolom `geojson` dikenali
otomatis (nama berakhiran `geojson`) — isinya objek `geometry` GeoJSON
Polygon per baris, bukan `Feature` lengkap. 10 provinsi di tabel ini SAMA
PERSIS dengan yang muncul di kolom `provinsi` pada `dara_data_lokasi`, jadi
kedua layer masuk akal ditampilkan bersamaan di menu Peta.

`id`, `kode`, `nama`, `pulau`, `ibu_kota`, `populasi_juta`, `luas_km2`, `geojson`

> **Poligonnya disederhanakan** (persegi panjang yang membungkus wilayah
> provinsi secara kasar), **bukan** batas administratif hasil survei —
> cukup untuk mendemonstrasikan fitur choropleth, bukan untuk dipakai apa
> adanya di produksi. `populasi_juta`/`luas_km2` juga angka perkiraan untuk
> demo, bukan data BPS resmi. Detail lengkap ada di komentar
> `006_data_provinsi.sql` dan `007_seed_provinsi.sql`.

`id`, `nama`, `jenis`, `provinsi`, `kota`, `lat`, `lon`, `kapasitas`

---

## Perintah

Semua dari folder induk proyek:

```bash
npm run db:migrate     # terapkan migrasi yang belum jalan
npm run db:seed        # migrasi + data contoh
npm run db:reset       # DROP semua dara_*, bangun ulang + data contoh
npm run db:status      # daftar migrasi: sudah / belum
```

Langsung dengan mysql:

```bash
mysql -u dara -p dara_free < db/schema/001_core.sql
```

Membuat ulang data contoh (mengganti `004_seed_sample.sql`):

```bash
node db/tools/generate-sample.mjs
```

Generator memakai bibit acak tetap, jadi hasilnya selalu sama. Ubah nilai
`s` di baris pertama berkasnya untuk mendapat kumpulan data berbeda.

---

## Menambah migrasi baru

1. Buat berkas dengan nomor berikutnya, mis. `db/schema/005_tambah_tag.sql`
2. Isi dengan perintah yang idempotent
   (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`)
3. Jalankan `npm run db:migrate`
4. Bila menambah kolom proyeksi, perbarui juga `PROJECTORS` di
   `server/src/config/metaStore.js`

> **Jangan pernah menyunting berkas migrasi yang sudah pernah dijalankan** di
> database orang lain. Migrasi hanya bergerak maju. `checksum` di
> `dara_schema_migrations` ada supaya penyimpangan seperti ini bisa dideteksi.

---

## Pemeriksaan cepat

```sql
-- Tabel apa saja yang ada?
SELECT table_name, table_comment
FROM information_schema.tables
WHERE table_schema = DATABASE() ORDER BY table_name;

-- Berapa isi tabel contoh?
SELECT 'penjualan' t, COUNT(*) n FROM dara_data_penjualan
UNION ALL SELECT 'pegawai', COUNT(*) FROM dara_data_pegawai
UNION ALL SELECT 'unit',    COUNT(*) FROM dara_data_unit
UNION ALL SELECT 'lokasi',  COUNT(*) FROM dara_data_lokasi;

-- Chart siapa saja?
SELECT id, nama, chart_type, owner_nip, updated_at FROM dara_charts;

-- Migrasi apa yang sudah jalan?
SELECT version, name, applied_at FROM dara_schema_migrations ORDER BY version;
```
