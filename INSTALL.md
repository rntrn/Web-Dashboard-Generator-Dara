# INSTALL — Cara Memasang DARA Free

Dokumen ini punya tiga jalur. Pilih satu:

- [A. Instalasi otomatis](#a-instalasi-otomatis) — direkomendasikan
- [B. Instalasi manual](#b-instalasi-manual) — kalau ingin tahu tiap langkahnya
- [C. Tanpa MySQL](#c-tanpa-mysql) — coba cepat pakai berkas lokal

Lalu lanjut ke [Setelah instalasi](#setelah-instalasi) dan
[Pemecahan masalah](#pemecahan-masalah).

---

## Prasyarat

| Yang dibutuhkan | Cara mengecek | Kalau belum ada |
|---|---|---|
| Node.js 18+ | `node -v` | unduh di <https://nodejs.org> (pilih LTS) |
| npm | `npm -v` | ikut terpasang bersama Node.js |
| MySQL 8.0+ berjalan | `mysql --version` | <https://dev.mysql.com/downloads/> atau XAMPP/Laragon |
| git (opsional) | `git --version` | hanya untuk clone & push |

> **Windows:** setelah memasang Node.js, tutup semua jendela Command Prompt dan
> buka yang baru. PATH baru tidak berlaku di jendela yang sudah terbuka.

### Menyiapkan user MySQL (disarankan)

Jangan pakai `root` untuk aplikasi. Buat user khusus:

```sql
CREATE USER 'dara'@'localhost' IDENTIFIED BY 'password-yang-kuat';
CREATE DATABASE dara_free CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON dara_free.* TO 'dara'@'localhost';
FLUSH PRIVILEGES;
```

Installer bisa membuat database sendiri, tapi user-nya harus sudah ada dan
punya izin `CREATE`.

---

## A. Instalasi otomatis

```bash
git clone https://github.com/rntrn/Web-Dashboard-Generator-Dara.git
cd Web-Dashboard-Generator-Dara
```

**Windows** (Command Prompt atau PowerShell)

```bat
.\install.bat
```

> **Catatan PowerShell:** awalan `.\` wajib. PowerShell tidak menjalankan program dari folder saat ini
> tanpa itu — `install.bat` saja akan ditolak. Di Command Prompt (`cmd.exe`) awalan itu tidak diperlukan.

**Linux / macOS**

```bash
chmod +x install.sh start.sh
./install.sh
```

Installer berjalan dalam 8 langkah dan akan menanyakan:

| Pertanyaan | Bawaan | Keterangan |
|---|---|---|
| Host MySQL | `127.0.0.1` | isi IP/hostname bila MySQL di mesin lain |
| Port MySQL | `3306` | |
| User MySQL | `root` | isi `dara` bila mengikuti langkah di atas |
| Password MySQL | *(kosong)* | tidak ditampilkan saat diketik |
| Nama database | `dara_free` | dibuat otomatis bila belum ada |
| Port server DARA | `3001` | ganti bila 3001 sudah dipakai |
| Pasang data contoh? | ya | 240 penjualan, 40 pegawai, 15 lokasi, 10 provinsi |
| Build client sekarang? | ya | perlu untuk mode produksi |

### Opsi baris perintah

```bash
node installer/index.js --yes           # pakai semua nilai bawaan, tanpa tanya
node installer/index.js --skip-install   # lewati npm install
node installer/index.js --skip-build     # lewati build client
node installer/index.js --no-sample      # tanpa data contoh
node installer/index.js --reset-db       # instalasi BERSIH — lihat di bawah
```

Installer **aman dijalankan ulang**: `.env` lama dicadangkan jadi `.env.bak`,
migrasi yang sudah pernah jalan dilewati, dan password admin tidak direset.

### Memasang ulang ke database yang sudah ada isinya

Kalau database tujuan sudah pernah dipasangi DARA sebelumnya (mis. mencoba
lagi setelah gagal, atau memakai database lama dari versi proyek yang lebih
tua), installer akan berhenti sejenak di langkah 4 dan menawarkan pilihan:

| Pilihan | Efek |
|---|---|
| Lanjutkan seperti biasa | Hanya menjalankan migrasi yang belum diterapkan. Aman, tidak menghapus apa pun. |
| Instalasi **BERSIH** | Menghapus semua tabel `dara_*` di database itu, lalu memasang ulang dari nol. **Data hilang** — pastikan sudah backup (`npm run backup` / `backup.bat`) kalau perlu. |
| Batalkan | Keluar tanpa mengubah apa pun. |

Untuk melewati pertanyaan ini (mis. dipakai dalam skrip otomatis):
`--yes` melanjutkan tanpa menghapus, `--reset-db` langsung memilih instalasi
bersih, atau gabungkan keduanya: `node installer/index.js --yes --reset-db`.

> **Kenapa ini penting:** installer melacak migrasi yang sudah jalan
> berdasarkan **nomor versi berkas** (mis. `002`), bukan isinya. Kalau
> database itu dipasangi versi lama proyek lalu skema `002` diperbarui
> (mis. tabel di-redesain), versi "002" tetap dianggap sudah beres dan
> dilewati — padahal strukturnya sudah tidak cocok. Migrasi berikutnya bisa
> gagal dengan galat MySQL yang membingungkan seperti `Unknown column
> 'email' in 'field list'`. `migrate.mjs` sekarang mendeteksi kondisi ini
> lewat checksum dan berhenti dengan pesan jelas alih-alih gagal di tengah
> jalan — solusinya selalu instalasi bersih di atas.

---

## B. Instalasi manual

Kalau installer gagal atau Anda ingin memahami tiap langkahnya:

### 1. Pasang dependensi

```bash
cd server && npm install
cd ../client && npm install
cd ..
```

### 2. Buat berkas konfigurasi

```bash
cp server/.env.example server/.env      # Windows: copy server\.env.example server\.env
cp client/.env.example client/.env
```

Sunting `server/.env`, isi minimal:

```ini
DB_TYPE=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=dara
MYSQL_PASSWORD=password-yang-kuat
MYSQL_DATABASE=dara_free
META_STORE=mysql
PORT=3001
JWT_SECRET=<tempel hasil perintah di bawah>
```

Membuat `JWT_SECRET` acak:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Buat database

```sql
CREATE DATABASE dara_free CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 4. Jalankan migrasi

```bash
cd server
npm run db:migrate          # tabel + data awal (peran, admin, konfigurasi)
npm run db:seed             # sama, plus data contoh dara_data_*
npm run db:status           # cek migrasi mana yang sudah jalan
```

Alternatif tanpa Node — jalankan berkas SQL langsung:

```bash
mysql -u dara -p dara_free < db/schema/001_core.sql
mysql -u dara -p dara_free < db/schema/002_sample_tables.sql
mysql -u dara -p dara_free < db/seed/003_seed_core.sql
mysql -u dara -p dara_free < db/seed/004_seed_sample.sql
```

> Catatan: cara manual ini tidak mengisi tabel `dara_schema_migrations`.
> Jalankan `npm run db:status` setelahnya untuk melihat selisihnya.

### 5. Build client (hanya untuk mode produksi)

```bash
cd client && npm run build
```

Lalu setel `SERVE_STATIC=true` di `server/.env`.

---

## C. Tanpa MySQL

Untuk mencoba DARA tanpa memasang database apa pun, sunting `server/.env`:

```ini
DB_TYPE=sqlite
DB_PATH=./dara.db
META_STORE=file
```

Metadata disimpan sebagai JSON di `server/data/`, sumber data di berkas
`dara.db`. Cocok untuk eksplorasi, **tidak untuk produksi** — tidak ada
transaksi bersamaan dan tidak ada backup terpusat.

---

## Setelah instalasi

### 1. Jalankan

```bash
./start.sh          # Windows: start.bat
```

Buka <http://localhost:5173>.

### 2. Login

| | |
|---|---|
| username | `admin` |
| password | `admin123` |

### 3. Ganti password admin — **wajib**

```bash
cd server
npm run create-admin
```

Restart server setelahnya (metadata dimuat saat boot).

### 4. Verifikasi

```bash
npm run db:status                    # semua migrasi tercatat?
curl http://localhost:3001/api/health   # {"status":"ok",...}
```

Di antarmuka, buka **Jelajah Data** — seharusnya muncul empat tabel:
`dara_data_penjualan`, `dara_data_pegawai`, `dara_data_unit`,
`dara_data_lokasi`.

---

## Memasang data Anda sendiri

Tiga cara, dari yang paling mudah:

1. **Upload CSV/Excel** lewat menu Upload di antarmuka. Tabel dibuat otomatis
   dengan nama `dara_data_upl_<nama>`.
2. **Impor SQL** ke database yang sama, dengan nama tabel berawalan
   `dara_data_`. Contoh: `dara_data_transaksi`.
3. **Ubah filter prefix.** Bila tabel Anda sudah ada dengan nama lain, ganti
   `DB_TABLE_PREFIX` di `server/.env`, atau kosongkan untuk menampilkan semua
   tabel non-metadata.

---

## Pemecahan masalah

### `ECONNREFUSED` saat installer menghubungi MySQL

MySQL belum berjalan atau host/port salah.

```bash
# Windows
net start MySQL80
# Linux (systemd)
sudo systemctl status mysql
```

### `ER_ACCESS_DENIED_ERROR`

Username atau password ditolak. Uji manual:

```bash
mysql -h 127.0.0.1 -P 3306 -u dara -p
```

Kalau MySQL 8 menolak driver Node dengan pesan tentang
`caching_sha2_password`, ubah metode autentikasi user:

```sql
ALTER USER 'dara'@'localhost' IDENTIFIED WITH mysql_native_password BY 'password';
FLUSH PRIVILEGES;
```

### `Error: listen EADDRINUSE :::3001`

Port sudah dipakai proses lain.

```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <pid> /F
# Linux/macOS
lsof -i :3001
```

Atau ganti `PORT` di `server/.env` (dan `VITE_API_URL` di `client/.env`).

### Antarmuka terbuka tapi semua data kosong / error 401

Token kedaluwarsa atau `JWT_SECRET` berubah setelah login. Keluar lalu masuk
lagi. Bila `JWT_SECRET` memang diganti, semua sesi lama otomatis tidak berlaku
— itu perilaku yang benar.

### Tabel tidak muncul di Jelajah Data

Nama tabel harus diawali `DB_TABLE_PREFIX` (bawaan `dara_data_`). Cek:

```sql
SHOW TABLES LIKE 'dara_data_%';
```

### `npm install` gagal karena jaringan

Coba registry cadangan atau jalankan ulang:

```bash
npm install --registry=https://registry.npmjs.org --no-audit --no-fund
```

Kalau di balik proxy perusahaan, setel `npm config set proxy` dan
`npm config set https-proxy` lebih dulu.

### `Migrasi gagal: Unknown column '...' in 'field list'` (atau galat "table/column tidak ditemukan" serupa)

Database tujuan dipasangi versi **lama** proyek ini dan skemanya sudah
berubah sejak itu — lihat penjelasan lengkap di
[Memasang ulang ke database yang sudah ada isinya](#memasang-ulang-ke-database-yang-sudah-ada-isinya).
Solusinya instalasi bersih:

```bash
node installer/index.js --reset-db     # lewat installer (disarankan)
# atau langsung:
cd server && npm run db:reset          # DROP semua tabel dara_*, bangun ulang + data contoh
```

`npm run db:reset` sama dengan opsi "Instalasi BERSIH" di atas, tapi
dijalankan langsung tanpa melalui installer (berguna kalau `.env` sudah benar
dan Anda cuma ingin mengulang skema database).

### Ingin mengulang dari nol

```bash
npm run db:reset      # DROP semua tabel dara_*, bangun ulang + data contoh
```

> `db:reset` menghapus semua chart dan dashboard yang sudah dibuat.
> Jalankan `npm run backup` dulu bila datanya masih dibutuhkan.

Masalah lain: lihat [`docs/07-troubleshooting.md`](docs/07-troubleshooting.md).

---

## Uninstall

Untuk menghapus **seluruh** database (bukan cuma tabel `dara_*`, tapi
seluruh database MySQL yang dipakai DARA) beserta folder hasil instalasi:

```bash
.\uninstall.bat        REM Windows (PowerShell: .\uninstall.bat)
./uninstall.sh          # Linux/macOS
```

Berbeda dari `db:reset`, perintah ini:

1. **Selalu membuat backup penuh lebih dulu** (kode + database + metadata +
   `.env`) — kalau backup gagal, uninstall dibatalkan seluruhnya dan
   database tidak disentuh. Tidak ada opsi untuk melewati langkah ini.
2. Meminta Anda mengetik ulang nama database sebagai konfirmasi.
3. Menghapus database, lalu `server/node_modules`, `client/node_modules`,
   `client/dist`, `server/.env`, `client/.env`, `server/backups/`,
   `server/data/`.

Kode sumber dan riwayat git **tidak** disentuh. Untuk memasang ulang:
`npm run setup` (lihat [A. Instalasi otomatis](#a-instalasi-otomatis)), atau
pulihkan dari backup — langkahnya ada di `INFO.txt` pada folder backup yang
ditulis ke `_backup-dara-free/` (di luar folder proyek).
