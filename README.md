🇮🇩 Bahasa Indonesia&nbsp;·&nbsp;[🇬🇧 English](README.en.md)

# DARA Free — Web Dashboard Generator

**Buat dashboard langsung dari database MySQL.** DARA membaca skema tabel Anda,
mengusulkan chart yang cocok secara otomatis, menyediakan pembuat chart manual
gaya Tableau/PowerBI, lalu menyusunnya jadi dashboard yang bisa dibagikan atau
ditanam (embed) ke aplikasi lain.

Versi ini adalah edisi **gratis dan terbuka** dari DARA: MySQL sebagai database,
autentikasi lokal, tanpa ketergantungan Oracle maupun LDAP.

```
Data Connection  →  Jelajah Data  →  Chart Builder  →  Dashboard  →  Story  →  Bagikan / Embed
(hubungkan DB       (usulan chart    (pilih dimensi   (grid 12      (presentasi   (viewer publik
 eksternal, admin)   otomatis)        & measure)       kolom)        bertahap)     ber-kunci)
```

*Data Connection* dan *Data Preparation* khusus admin — lihat
[`docs/08-data-connection.md`](docs/08-data-connection.md) untuk
arsitektur & status fasenya.

---

## Daftar isi

- [Untuk siapa dokumen ini](#untuk-siapa-dokumen-ini)
- [Instalasi cepat](#instalasi-cepat)
- [Menjalankan](#menjalankan)
- [Koneksi database eksternal (Data Connection)](#koneksi-database-eksternal-data-connection)
- [Peta dokumentasi](#peta-dokumentasi)
- [Struktur proyek](#struktur-proyek)
- [Kebutuhan sistem](#kebutuhan-sistem)
- [Perintah yang sering dipakai](#perintah-yang-sering-dipakai)
- [Lisensi](#lisensi)
- [Support Me](#-support-me)

---

## Untuk siapa dokumen ini

Dokumen di repositori ini ditulis bertingkat — mulai dari yang paling
praktis sampai yang paling dalam. Anda tidak perlu membaca semuanya
sekaligus:

| Kalau Anda ingin… | Baca |
|---|---|
| memasang dan menjalankan | `INSTALL.md` |
| memakai aplikasinya | `USAGE.md` |
| tahu isi tiap tabel database | `db/README.md` |

---

## Instalasi cepat

Prasyarat: **Node.js 18+** dan **MySQL 8.0+** (atau MariaDB 10.5+) yang sudah berjalan.

**Windows**

```bat
git clone https://github.com/rntrn/Web-Dashboard-Generator-Dara.git
cd Web-Dashboard-Generator-Dara
install.bat
```

**Linux / macOS**

```bash
git clone https://github.com/rntrn/Web-Dashboard-Generator-Dara.git
cd Web-Dashboard-Generator-Dara
chmod +x install.sh start.sh
./install.sh
```

Installer akan menanyakan kredensial MySQL, membuat database, membuat semua
tabel, mengisi data contoh, dan menulis berkas `.env`. Rinciannya di
[`INSTALL.md`](INSTALL.md).

---

## Menjalankan

**Mode pengembangan** (dua proses, hot reload):

```bash
./start.sh            # Windows: start.bat
# antarmuka  http://localhost:5173
# backend    http://localhost:3001
```

**Mode produksi** (satu proses, satu port):

```bash
./start.sh prod       # Windows: start.bat prod
# semuanya di http://localhost:3001
```

Login pertama: **admin / admin123** — segera ganti dengan `npm run create-admin`.

---

## Koneksi database eksternal (Data Connection)

MySQL tetap wajib untuk metadata DARA sendiri. *Data Connection* adalah
menu tambahan (khusus admin) untuk menghubungkan database **lain**, lalu
menarik ("impor") tabel/koleksi pilihan jadi tabel baru di database DARA
sendiri — setelah itu langsung bisa dipakai di Jelajah Data/Chart Builder
seperti tabel biasa. Lihat [`docs/08-data-connection.md`](docs/08-data-connection.md)
untuk arsitektur & batasan lengkapnya (kenapa bukan live query lintas-
database, batas 100.000 baris per impor, dst).

**16 driver sudah punya adapter kode siap pakai**: PostgreSQL,
MySQL/MariaDB, SQL Server, Oracle, SQLite eksternal, MongoDB, Redis,
Cassandra, ClickHouse, CockroachDB, Neo4j, Firestore, Snowflake, DynamoDB,
Pinecone, Milvus.

Supaya instalasi dasar tetap ringan, hanya 4 yang terpasang otomatis —
sisanya dipasang sesuai kebutuhan:

| | Driver |
|---|---|
| **Terpasang otomatis** | `mysql`, `postgres`, `cockroachdb`, `sqlite_ext` |
| **Perlu instal manual** (12) | mssql, oracle, clickhouse, snowflake, mongodb, cassandra, neo4j, redis, dynamodb, firestore, pinecone, milvus |

```bash
cd server
npm run driver:install -- --list        # lihat semua driver + status
npm run driver:install -- mssql mongodb # pasang satu/beberapa driver
```

Bisa juga dipasang sekaligus saat instalasi awal — installer menawarkan
langkah opsional ini di langkah 3 (butuh internet, bisa dilewati, bawaan:
dilewati). Kalau driver dipilih di UI tapi paketnya belum terpasang,
tombol "Tes" gagal dengan pesan jelas berisi perintah instalasinya, bukan
crash.

### Olah data sebelum dipakai chart (Data Preparation)

Setelah tabel ada di DARA (upload, impor Data Connection, atau tabel
contoh), menu **Data Preparation** (admin) bisa menggabung & merapikannya
tanpa perlu tulis SQL: pilih tabel sumber → pilih/ganti nama/ubah tipe
kolom → opsional gabung (JOIN) dengan satu tabel lain (saran relasi
otomatis) → pratinjau langsung → simpan sebagai tabel baru. Tabel hasilnya
bisa dibagikan ke pengguna biasa seperti tabel upload/impor. Detail lengkap
di [`docs/08-data-connection.md`](docs/08-data-connection.md).

---

## Peta dokumentasi

```
README.md              ← Anda di sini: gambaran umum
INSTALL.md             cara pasang (otomatis & manual) + pemecahan masalah
USAGE.md               cara pakai, dari jelajah data sampai embed
db/README.md           kamus data: setiap tabel dan kolomnya
```

---

## Struktur proyek

```
dara-free/
├── installer/          Installer CLI (Node murni, tanpa dependensi)
│   ├── index.js        alur utama 8 langkah
│   └── lib/            ui, prasyarat, env, db
├── db/                 Semua yang berhubungan dengan database
│   ├── schema/         DDL: 001_core.sql, 002_sample_tables.sql
│   ├── seed/           data awal: 003_seed_core.sql, 004_seed_sample.sql
│   ├── tools/          generator data contoh
│   └── README.md       kamus data
├── server/             Backend Express (ESM)
│   ├── src/
│   │   ├── config/     database.js, metaStore.js, appConfig.js
│   │   ├── lib/        dialect.js, aggExpr.js, filterSql.js, acl.js, ...
│   │   ├── middlewares/auth, security, rate limit, static
│   │   ├── modules/    satu folder per domain (charts, dashboards, ...)
│   │   └── server.js   entry point
│   └── scripts/        migrate, create-admin, backup, drop-database
├── client/             Frontend React + Vite + Tailwind
│   └── src/
├── install.bat/.sh     pembungkus installer
├── start.bat/.sh       menjalankan aplikasi
└── uninstall.bat/.sh   hapus database + folder instalasi (backup wajib dulu)
```

Satu modul backend = satu folder berisi `*.routes.js` (URL), `*.controller.js`
(baca permintaan), `*.service.js` (aturan bisnis), `*.repository.js` (akses
data). Pembagian ini konsisten di semua modul.

---

## Kebutuhan sistem

| Komponen | Minimum | Catatan |
|---|---|---|
| Node.js | 18 | 20 LTS disarankan |
| MySQL | 8.0 | MariaDB 10.5+ juga jalan |
| RAM | 512 MB | untuk server |
| Peramban | Chrome/Edge/Firefox versi terkini | |

Alternatif tanpa MySQL: setel `DB_TYPE=sqlite` dan `META_STORE=file` di
`server/.env` untuk mencoba DARA memakai berkas lokal. Fitur agregasi
statistik (MEDIAN/P90/P95) justru hanya tersedia di mode ini.

---

## Perintah yang sering dipakai

Semua dijalankan dari folder induk proyek.

| Perintah | Kegunaan |
|---|---|
| `npm run setup` | jalankan installer |
| `npm run db:migrate` | terapkan migrasi yang belum jalan |
| `npm run db:seed` | migrasi + pasang data contoh |
| `npm run db:reset` | hapus semua tabel `dara_*` lalu bangun ulang |
| `npm run db:status` | lihat migrasi mana yang sudah/belum jalan |
| `npm run create-admin` | ganti username & password admin |
| `npm run backup` | cadangkan **metadata** DARA jadi .zip |
| `npm run build` | build antarmuka untuk produksi |
| `npm run uninstall` | hapus database + folder instalasi (backup penuh wajib dulu, lihat [`INSTALL.md`](INSTALL.md#uninstall)) |

### Backup

Data (`mysqldump`) dan `.env` tidak pernah masuk git (lihat `.gitignore`) —
jadi commit/push saja tidak cukup untuk menyelamatkan keduanya. Cadangkan
metadata lewat `npm run backup`, lalu `mysqldump` untuk data, dan salin
`.env` secara manual sebelum perubahan besar.

> **PowerShell:** awalan `.\` wajib untuk menjalankan `.bat`/skrip dari
> folder saat ini (mis. `.\install.bat`) — tanpa itu PowerShell menolak
> dengan *"is not recognized as the name of a cmdlet"*. Di Command Prompt
> (cmd.exe) awalan itu tidak diperlukan.

---

## Lisensi

MIT — lihat [`LICENSE`](LICENSE).

---

## ☕ Support Me
If you find this project useful, you can support me on Ko-fi:
[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/laqoushop)
