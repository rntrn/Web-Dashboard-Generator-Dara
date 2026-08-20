// Generator seed data contoh — deterministik (PRNG bibit tetap)
let s = 20260812;
const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const q = (v) => "'" + String(v).replace(/'/g, "''") + "'";

const units = [
  ['UNT-01','Divisi Penjualan','Jakarta'],
  ['UNT-02','Divisi Operasional','Jakarta'],
  ['UNT-03','Divisi Keuangan','Jakarta'],
  ['UNT-04','Divisi Teknologi Informasi','Bandung'],
  ['UNT-05','Divisi SDM','Surabaya'],
  ['UNT-06','Cabang Medan','Medan'],
  ['UNT-07','Cabang Makassar','Makassar'],
  ['UNT-08','Cabang Denpasar','Denpasar'],
];

const kotaProv = [
  ['Jakarta Pusat','DKI Jakarta'], ['Bandung','Jawa Barat'], ['Semarang','Jawa Tengah'],
  ['Surabaya','Jawa Timur'], ['Medan','Sumatera Utara'], ['Palembang','Sumatera Selatan'],
  ['Makassar','Sulawesi Selatan'], ['Denpasar','Bali'], ['Balikpapan','Kalimantan Timur'],
  ['Yogyakarta','DI Yogyakarta'],
];
const katalog = [
  ['Elektronik','Laptop Pro 14', 14500000], ['Elektronik','Monitor 24 inci', 2100000],
  ['Elektronik','Printer Laser', 3250000],  ['Perabot','Kursi Ergonomis', 1850000],
  ['Perabot','Meja Kerja', 2400000],        ['Perabot','Lemari Arsip', 1650000],
  ['ATK','Kertas A4 (rim)', 58000],         ['ATK','Tinta Printer', 275000],
  ['Jasa','Lisensi Software 1 thn', 4800000],['Jasa','Perawatan Perangkat', 950000],
];
const kanal = ['Online','Offline','Mitra'];
const reps = ['Budi Santoso','Sari Wulandari','Agus Priyanto','Dewi Lestari','Rizky Ramadhan','Nina Kartika'];

const namaDepan = ['Budi','Sari','Agus','Dewi','Rizky','Nina','Hendra','Fitri','Bayu','Lestari','Dimas','Ayu','Fajar','Intan','Yoga','Rani','Andi','Maya','Reza','Tuti'];
const namaBlk  = ['Santoso','Wulandari','Priyanto','Lestari','Ramadhan','Kartika','Setiawan','Handayani','Nugroho','Puspita'];
const jabatan  = ['Staf','Analis','Supervisor','Manajer','Kepala Divisi'];
const golongan = ['III/a','III/b','III/c','III/d','IV/a','IV/b'];

const lokasi = [
  ['Kantor Pusat','Kantor','DKI Jakarta','Jakarta Pusat',-6.186486,106.834091,450],
  ['Gudang Cakung','Gudang','DKI Jakarta','Jakarta Timur',-6.183000,106.950000,1200],
  ['Outlet Kelapa Gading','Outlet','DKI Jakarta','Jakarta Utara',-6.157000,106.906000,80],
  ['Kantor Bandung','Kantor','Jawa Barat','Bandung',-6.914744,107.609810,180],
  ['Gudang Cimahi','Gudang','Jawa Barat','Cimahi',-6.872000,107.542000,800],
  ['Kantor Semarang','Kantor','Jawa Tengah','Semarang',-6.966667,110.416664,120],
  ['Kantor Surabaya','Kantor','Jawa Timur','Surabaya',-7.257472,112.752090,210],
  ['Gudang Sidoarjo','Gudang','Jawa Timur','Sidoarjo',-7.446600,112.718900,950],
  ['Kantor Medan','Kantor','Sumatera Utara','Medan',3.595196,98.672226,140],
  ['Outlet Palembang','Outlet','Sumatera Selatan','Palembang',-2.976074,104.775429,70],
  ['Kantor Makassar','Kantor','Sulawesi Selatan','Makassar',-5.147665,119.432732,130],
  ['Outlet Denpasar','Outlet','Bali','Denpasar',-8.650000,115.216667,65],
  ['Kantor Balikpapan','Kantor','Kalimantan Timur','Balikpapan',-1.267000,116.828000,95],
  ['Outlet Yogyakarta','Outlet','DI Yogyakarta','Yogyakarta',-7.797068,110.370529,60],
  ['Gudang Bekasi','Gudang','Jawa Barat','Bekasi',-6.238270,106.975570,1100],
];

const L = [];
L.push(`-- =====================================================================`);
L.push(`-- DARA FREE — 004_seed_sample.sql`);
L.push(`-- Data CONTOH untuk tabel dara_data_*. Berkas ini DIHASILKAN otomatis`);
L.push(`-- oleh db/tools/generate-sample.mjs (bibit acak tetap → hasil stabil).`);
L.push(`--`);
L.push(`-- Isi: 8 unit, 40 pegawai, 15 lokasi, 240 transaksi penjualan`);
L.push(`--      sepanjang Jan–Des 2025 (cukup untuk chart time series & KPI).`);
L.push(`--`);
L.push(`-- Aman diulang: setiap tabel di-TRUNCATE lebih dulu. Kalau Anda sudah`);
L.push(`-- mengisi tabel ini dengan data asli, JANGAN jalankan berkas ini lagi.`);
L.push(`-- =====================================================================`);
L.push('');
L.push('SET FOREIGN_KEY_CHECKS = 0;');
L.push('TRUNCATE TABLE dara_data_penjualan;');
L.push('TRUNCATE TABLE dara_data_pegawai;');
L.push('TRUNCATE TABLE dara_data_unit;');
L.push('TRUNCATE TABLE dara_data_lokasi;');
L.push('SET FOREIGN_KEY_CHECKS = 1;');
L.push('');

// -- unit
L.push('-- ---------------------------------------------------------------------');
L.push('-- Unit kerja (tabel dimensi)');
L.push('-- ---------------------------------------------------------------------');
L.push('INSERT INTO dara_data_unit (id, kode, nama, wilayah) VALUES');
L.push(units.map((u,i)=>`  (${i+1}, ${q(u[0])}, ${q(u[1])}, ${q(u[2])})`).join(',\n') + ';');
L.push('');

// -- pegawai
L.push('-- ---------------------------------------------------------------------');
L.push('-- Pegawai (berelasi ke dara_data_unit lewat unit_id)');
L.push('-- ---------------------------------------------------------------------');
const peg = [];
for (let i = 1; i <= 40; i++) {
  const nama = `${pick(namaDepan)} ${pick(namaBlk)}`;
  const nip = `19${int(80,99)}${String(int(1,12)).padStart(2,'0')}${String(int(1,28)).padStart(2,'0')}${String(i).padStart(3,'0')}`;
  const th = int(2008, 2023), bl = int(1,12), tg = int(1,28);
  const jab = pick(jabatan);
  const gajiBase = { 'Staf':5200000,'Analis':7400000,'Supervisor':9800000,'Manajer':14500000,'Kepala Divisi':21000000 }[jab];
  peg.push(`  (${i}, ${q(nip)}, ${q(nama)}, ${int(1,8)}, ${q(jab)}, ${q(pick(golongan))}, ${q(rnd()>0.45?'L':'P')}, '${th}-${String(bl).padStart(2,'0')}-${String(tg).padStart(2,'0')}', ${gajiBase + int(0,900)*1000}.00)`);
}
L.push('INSERT INTO dara_data_pegawai (id, nip, nama, unit_id, jabatan, golongan, gender, tanggal_masuk, gaji_pokok) VALUES');
L.push(peg.join(',\n') + ';');
L.push('');

// -- lokasi
L.push('-- ---------------------------------------------------------------------');
L.push('-- Lokasi (lat/lon untuk fitur peta)');
L.push('-- ---------------------------------------------------------------------');
L.push('INSERT INTO dara_data_lokasi (id, nama, jenis, provinsi, kota, lat, lon, kapasitas) VALUES');
L.push(lokasi.map((r,i)=>`  (${i+1}, ${q(r[0])}, ${q(r[1])}, ${q(r[2])}, ${q(r[3])}, ${r[4].toFixed(6)}, ${r[5].toFixed(6)}, ${r[6]})`).join(',\n') + ';');
L.push('');

// -- penjualan
L.push('-- ---------------------------------------------------------------------');
L.push('-- Penjualan (240 baris, Jan–Des 2025)');
L.push('-- Nilai naik tipis tiap bulan + puncak akhir tahun, supaya grafik');
L.push('-- garis memperlihatkan tren yang masuk akal, bukan noise acak.');
L.push('-- ---------------------------------------------------------------------');
const jual = [];
let id = 0;
for (let bulan = 1; bulan <= 12; bulan++) {
  const trend = 1 + (bulan - 1) * 0.04 + (bulan >= 11 ? 0.25 : 0);
  for (let n = 0; n < 20; n++) {
    id++;
    const [kota, prov] = pick(kotaProv);
    const [kat, prod, harga] = pick(katalog);
    const qty = Math.max(1, Math.round(int(1, 12) * trend));
    const hs = Math.round(harga * (0.95 + rnd() * 0.1));
    const tgl = `2025-${String(bulan).padStart(2,'0')}-${String(int(1,28)).padStart(2,'0')}`;
    jual.push(`  (${id}, '${tgl}', ${q(kota)}, ${q(prov)}, ${q(kat)}, ${q(prod)}, ${q(pick(kanal))}, ${qty}, ${hs}.00, ${qty*hs}.00, ${q(pick(reps))})`);
  }
}
L.push('INSERT INTO dara_data_penjualan (id, tanggal, kota, provinsi, kategori, produk, kanal, qty, harga_satuan, total, sales_rep) VALUES');
L.push(jual.join(',\n') + ';');
L.push('');
L.push('-- Ringkasan cepat (jalankan manual untuk mengecek hasil seed):');
L.push('--   SELECT COUNT(*) FROM dara_data_penjualan;   -- 240');
L.push('--   SELECT COUNT(*) FROM dara_data_pegawai;     -- 40');
L.push('--   SELECT COUNT(*) FROM dara_data_unit;        -- 8');
L.push('--   SELECT COUNT(*) FROM dara_data_lokasi;      -- 15');

import fs from 'fs';
fs.writeFileSync('/sessions/dreamy-loving-cray/mnt/Mandor package/dara-free/db/seed/004_seed_sample.sql', L.join('\n') + '\n');
console.log('OK baris:', L.length);
