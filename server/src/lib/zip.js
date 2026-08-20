/**
 * zip.js — penulis arsip ZIP minimal TANPA dependency eksternal.
 *
 * Kenapa dibuat sendiri: modul Export-to-Script hanya perlu membungkus
 * beberapa file teks + satu JSON snapshot menjadi satu .zip untuk diunduh.
 * Menambah library (archiver/jszip) berlebihan untuk kebutuhan sekecil ini.
 *
 * Yang didukung:
 *  - Metode DEFLATE (8) via zlib bawaan Node; fallback STORE (0) bila hasil
 *    deflate malah lebih besar (mis. file sangat kecil).
 *  - Nama file UTF-8 (bendera bit 11 diset).
 *  - CRC-32 dihitung manual (tabel standar IEEE 802.3).
 *
 * Batas: tidak mendukung ZIP64 (file < 4GB) — cukup untuk keperluan ini.
 *
 * CARA PAKAI:
 *   import { zipSync } from "../../lib/zip.js";
 *   const buf = zipSync([
 *     { name: "index.html", data: "<html>..." },
 *     { name: "assets/app.js", data: Buffer.from(...) },
 *   ]);
 *   // buf = Buffer siap dikirim sebagai application/zip
 */

import zlib from "zlib";

// Tabel CRC-32 (dihitung sekali saat modul dimuat).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Waktu & tanggal format DOS (dipakai di header ZIP). */
function dosDateTime(d = new Date()) {
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
  const date = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  return { time, date };
}

/**
 * Bungkus daftar file menjadi satu Buffer ZIP.
 * @param {Array<{name:string, data:string|Buffer}>} files
 * @returns {Buffer}
 */
export function zipSync(files) {
  const { time, date } = dosDateTime();
  const localParts = [];   // header lokal + nama + data terkompresi
  const centralParts = []; // central directory
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const content = Buffer.isBuffer(f.data) ? f.data : Buffer.from(String(f.data), "utf8");
    const crc = crc32(content);

    const deflated = zlib.deflateRawSync(content);
    const useDeflate = deflated.length < content.length;
    const stored = useDeflate ? deflated : content;
    const method = useDeflate ? 8 : 0;

    // ---- Local file header (30 byte + nama) ----
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // signature
    lh.writeUInt16LE(20, 4);         // versi minimal
    lh.writeUInt16LE(0x0800, 6);     // flag: nama UTF-8
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(stored.length, 18);   // ukuran terkompresi
    lh.writeUInt32LE(content.length, 22);  // ukuran asli
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);               // panjang extra
    localParts.push(lh, nameBuf, stored);

    // ---- Central directory header (46 byte + nama) ----
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);   // versi pembuat
    ch.writeUInt16LE(20, 6);   // versi minimal
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(stored.length, 20);
    ch.writeUInt32LE(content.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);   // extra
    ch.writeUInt16LE(0, 32);   // comment
    ch.writeUInt16LE(0, 34);   // disk
    ch.writeUInt16LE(0, 36);   // atribut internal
    ch.writeUInt32LE(0, 38);   // atribut eksternal
    ch.writeUInt32LE(offset, 42); // offset header lokal
    centralParts.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + stored.length;
  }

  const central = Buffer.concat(centralParts);
  const centralOffset = offset;

  // ---- End of central directory (22 byte) ----
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, central, eocd]);
}

export default zipSync;
