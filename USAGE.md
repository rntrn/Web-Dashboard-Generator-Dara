# USAGE — Cara Memakai DARA Free

Panduan ini mengikuti alur kerja yang sebenarnya: dari melihat data mentah
sampai dashboard yang bisa dibagikan.

```
1. Jelajah Data  →  2. Chart  →  3. Dashboard  →  4. Story  →  5. Bagikan
```

Setiap bagian di bawah adalah satu langkah dari alur itu. Kalau baru pertama
kali, ikuti berurutan memakai data contoh yang sudah dipasang installer.

---

## 0. Masuk

Buka <http://localhost:5173> (mode pengembangan) atau
<http://localhost:3001> (mode produksi).

| Peran | Bisa apa |
|---|---|
| `admin` | semuanya, termasuk pengaturan & kelola pengguna |
| `editor` | membuat & mengubah chart, dashboard, story, upload |
| `viewer` | hanya melihat yang dibagikan kepadanya |

Ganti password bawaan lebih dulu: `cd server && npm run create-admin`.

---

## 1. Jelajah Data

Menu **Jelajah Data** menampilkan semua tabel yang boleh dibaca — yaitu tabel
berawalan `dara_data_`.

Untuk setiap tabel Anda melihat:

- **Kolom & tipe** — hasil pembacaan `information_schema`
- **Jumlah baris**
- **Contoh data** — 100 baris pertama
- **Usulan chart** — daftar chart yang cocok, dihitung otomatis

### Bagaimana usulan chart dibuat

DARA memeriksa tiap kolom lalu menilai tiga hal: apakah numerik, apakah
bertipe waktu, dan berapa banyak nilai uniknya (*cardinality*). Dari situ:

| Pola kolom | Usulan |
|---|---|
| kolom tanggal + kolom angka | garis (tren waktu) |
| kategori sedikit (< 10 nilai unik) + angka | pie / donut |
| kategori banyak + angka | batang |
| satu kolom angka saja | KPI (angka besar) |
| dua kolom angka | scatter |
| kolom lat & lon | peta titik |

Klik **Simpan** pada usulan mana pun untuk memasukkannya ke koleksi chart.

> Coba dengan `dara_data_penjualan`: kolom `tanggal` + `total` akan
> menghasilkan usulan grafik garis tren penjualan 2025.

---

## 2. Membuat chart sendiri

Menu **Chart Builder** bekerja seperti "Show Me" di Tableau: pilih data dulu,
tipe chart yang tidak masuk akal otomatis dinonaktifkan.

### Langkah

1. **Pilih tabel** — mis. `dara_data_penjualan`
2. **Dimensi** (maks 2) — kolom pengelompokan, mis. `kategori`
3. **Measure** (maks 2) — kolom angka yang dihitung, mis. `total`
4. **Agregasi** — `SUM`, `AVG`, `COUNT`, `MIN`, `MAX`, `DISTINCT`
5. **Tipe chart** — yang tersedia menyesuaikan pilihan di atas
6. **Simpan**

### Fitur tambahan

| Fitur | Cara pakai |
|---|---|
| **Grain tanggal** | pada dimensi waktu, pilih tahun / bulan / hari |
| **Top-N** | batasi jumlah kategori yang ditampilkan |
| **Calculated field** | measure berupa ekspresi, mis. `total / qty` |
| **Format angka** | ribuan, rupiah, persen, atau ringkas (1,2 jt) |
| **Chart lintas-tabel** | pilih relasi JOIN, mis. pegawai → unit |
| **Conditional formatting** | pada tabel/pivot: warna berdasarkan nilai |

**Calculated field** hanya menerima nama kolom, angka, operator `+ - * / %`,
dan tanda kurung. Fungsi dan tanda kutip ditolak — ini disengaja untuk
mencegah injeksi SQL.

> **Batasan MySQL:** agregasi `MEDIAN`, `P90`, `P95` belum tersedia di MySQL
> karena MySQL 8 tidak punya fungsi persentil bawaan. DARA akan menolak dengan
> pesan jelas, bukan memberi angka yang salah.

### Chart lintas-tabel (JOIN)

DARA mendeteksi relasi lewat konvensi penamaan `*_id`. Contoh:
`dara_data_pegawai.unit_id` → `dara_data_unit.id`.

Kalau tabel Anda tidak mengikuti konvensi itu, tambahkan relasi manual ke
tabel `dara_relations`:

```sql
INSERT INTO dara_relations (from_table, from_column, to_table, to_column, join_type)
VALUES ('dara_data_transaksi', 'kd_pelanggan', 'dara_data_pelanggan', 'kode', 'LEFT');
```

---

## 3. Menyusun dashboard

Menu **Dashboard** menyusun chart tersimpan ke dalam grid 12 kolom.

### Dua cara membuat

- **Otomatis** — tombol *Buat otomatis*: DARA memilih sampai 7 chart yang
  variatif (KPI di atas, grafik garis melebar penuh, sisanya setengah lebar).
- **Manual** — seret chart dari panel samping, atur ukuran dengan menarik
  sudutnya.

### Yang bisa diatur

| Bagian | Keterangan |
|---|---|
| Judul & subjudul | tampil di atas dashboard |
| Tema warna | memengaruhi seluruh chart di dalamnya |
| Logo | gambar kecil di pojok |
| Widget teks | kotak penjelasan di antara chart |
| **Slicer** | filter global untuk semua chart sekaligus |

### Slicer

Tiga jenis:

| Jenis | Untuk |
|---|---|
| Pilih satu | kategori tunggal, mis. provinsi |
| Multi-pilih | beberapa nilai sekaligus |
| Rentang tanggal | periode |

Slicer bersifat **cascading**: memilih satu slicer akan mempersempit pilihan
slicer lain, sehingga tidak muncul kombinasi yang datanya kosong.

### Ekspor

Tombol ekspor menghasilkan **PNG** atau **PDF** dari tampilan saat ini,
termasuk filter slicer yang sedang aktif.

---

## 4. Story

**Story** merangkai beberapa dashboard jadi presentasi bertahap. Tiap langkah
berisi satu dashboard plus teks narasi.

1. Buat story baru, beri nama
2. Tambah langkah → pilih dashboard → tulis narasi
3. Susun urutannya
4. Jalankan mode presentasi

Cocok untuk laporan bulanan: satu langkah untuk ringkasan, satu untuk
rincian per wilayah, satu untuk kesimpulan.

---

## 5. Membagikan & embed

### Berbagi ke pengguna lain

Tombol **Bagikan** pada chart/dashboard/story membuka pencarian pengguna
(minimal 4 karakter). Pengguna yang dipilih bisa **melihat**, tidak mengubah.

Kepemilikan ditegakkan bila ACL aktif (Pengaturan → ACL). Bila ACL dimatikan,
semua pengguna yang login bisa melihat semua item.

### Embed ke aplikasi lain

1. Buka dashboard → **Buat kunci embed**
2. Salin URL yang muncul:

```
http://localhost:3001/view/<id-dashboard>?key=<kunci>
```

3. Tanam di aplikasi Anda:

```html
<iframe src="http://localhost:3001/view/abc123?key=9f2c..."
        width="100%" height="720" frameborder="0"></iframe>
```

Filter bisa dikirim lewat query string:

```
...&filter_provinsi=Jawa%20Barat&filter_tanggal_from=2025-01-01
```

Kunci embed bisa dicabut kapan saja — buat ulang kunci, yang lama langsung
tidak berlaku.

> **Keamanan:** siapa pun yang punya URL + kunci bisa melihat dashboard tanpa
> login. Jangan pakai kunci embed untuk data sensitif di jaringan publik.

---

## 6. Upload CSV / Excel

Menu **Upload** membuat tabel baru dari berkas.

| Batas | Nilai |
|---|---|
| Baris | 100.000 |
| Kolom | 80 |
| Format | CSV, XLSX |

Nama tabel hasil: `dara_data_upl_<nama-berkas>`. Nama kolom dibersihkan
otomatis (huruf kecil, spasi jadi garis bawah). Tipe kolom ditebak: kolom yang
semua isinya angka jadi numerik, sisanya teks.

Tabel hasil upload **selalu privat** — hanya pengunggah dan admin yang bisa
melihatnya, kecuali dibagikan secara eksplisit. Ini berlaku walaupun ACL global
dimatikan.

---

## 7. Administrasi

Menu **Pengaturan** (admin saja):

| Pengaturan | Efek |
|---|---|
| Identitas & tema | nama aplikasi, logo, favicon, warna aksen |
| Kelola pengguna | tambah/hapus pengguna, atur peran, **reset password** ke bawaan `user123` |
| ACL | aktifkan/matikan kepemilikan per item |
| Upload | aktifkan/matikan fitur upload |
| Mode dev | tampilkan detail galat di antarmuka — **matikan di produksi** |
| Log aktivitas | 2.000 aktivitas terakhir |

### Backup

```bash
npm run backup
```

Menghasilkan `server/backups/dara-metadata-<tanggal>.zip` berisi seluruh
metadata sebagai JSON. Backup lama dirotasi otomatis (30 terakhir).

Untuk mencadangkan **data** Anda (tabel `dara_data_*`), pakai `mysqldump` —
lihat [`docs/05-backup-restore.md`](docs/05-backup-restore.md).

---

## Pertanyaan yang sering muncul

**Tabel saya tidak muncul.**
Nama tabel harus diawali `dara_data_`, atau ubah `DB_TABLE_PREFIX` di
`server/.env`.

**Chart lambat.**
Tambahkan index pada kolom yang dipakai sebagai dimensi dan filter:
`CREATE INDEX idx_x ON dara_data_penjualan (provinsi);`

**Angka di KPI muncul sebagai teks.**
Kolomnya bertipe `VARCHAR` di MySQL. Ubah tipenya, atau pakai calculated field
untuk mengonversi.

**Bisa dipakai banyak orang bersamaan?**
Untuk membaca dashboard: ya. Untuk mengedit bersamaan dari beberapa proses
server: belum didukung.
