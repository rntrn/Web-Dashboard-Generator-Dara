/**
 * prasyarat.js — pemeriksaan lingkungan sebelum instalasi dimulai.
 *
 * Prinsipnya: gagal SEAWAL mungkin dengan pesan yang menyebutkan apa yang
 * kurang dan cara memperbaikinya. Lebih baik berhenti di detik ke-2 daripada
 * gagal di menit ke-5 setelah `npm install` berjalan setengah jalan.
 */

import { execFileSync } from "child_process";

/** Jalankan perintah, kembalikan stdout. null bila perintah tidak ada/gagal. */
function jalankan(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      shell: process.platform === "win32", // npm di Windows adalah npm.cmd
    }).trim();
  } catch {
    return null;
  }
}

/** Ambil angka mayor dari string versi seperti "v20.11.0" atau "10.2.4". */
function mayor(versi) {
  const m = String(versi || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Periksa semua prasyarat.
 * @returns {{lolos: boolean, hasil: Array<{nama,status,pesan,wajib}>}}
 */
export function periksaPrasyarat() {
  const hasil = [];

  // --- Node.js ---
  const nodeVersi = process.version;
  const nodeOk = mayor(nodeVersi) >= 18;
  hasil.push({
    nama: "Node.js",
    wajib: true,
    status: nodeOk,
    pesan: nodeOk
      ? `${nodeVersi}`
      : `${nodeVersi} — DARA butuh Node 18 atau lebih baru. Unduh di https://nodejs.org`,
  });

  // --- npm ---
  const npmVersi = jalankan("npm", ["--version"]);
  hasil.push({
    nama: "npm",
    wajib: true,
    status: !!npmVersi,
    pesan: npmVersi || "tidak ditemukan. npm biasanya ikut terpasang bersama Node.js.",
  });

  // --- klien MySQL (opsional) ---
  // Installer memakai driver mysql2 dari Node, jadi perintah `mysql` TIDAK
  // wajib. Ia hanya memudahkan pemeriksaan manual, jadi statusnya informatif.
  const mysqlVersi = jalankan("mysql", ["--version"]);
  hasil.push({
    nama: "klien mysql (opsional)",
    wajib: false,
    status: !!mysqlVersi,
    pesan: mysqlVersi || "tidak ada di PATH — tidak masalah, installer memakai driver Node.",
  });

  // --- git (opsional) ---
  const gitVersi = jalankan("git", ["--version"]);
  hasil.push({
    nama: "git (opsional)",
    wajib: false,
    status: !!gitVersi,
    pesan: gitVersi || "tidak ada di PATH — hanya dibutuhkan untuk push ke repositori.",
  });

  const lolos = hasil.filter((h) => h.wajib).every((h) => h.status);
  return { lolos, hasil };
}

export default periksaPrasyarat;
