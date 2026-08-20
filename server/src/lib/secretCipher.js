/**
 * secretCipher.js — enkripsi simetris untuk RAHASIA yang harus bisa dibaca
 * ulang oleh aplikasi sendiri (BEDA dari password user yang di-hash bcrypt
 * satu arah). Dipakai untuk password koneksi database eksternal
 * (modul Data Connection) — lihat db/schema/008_connections.sql.
 *
 * Algoritma: AES-256-GCM (autentikasi bawaan, bukan sekadar CBC polos).
 * Format hasil enkripsi (base64 dari gabungan biner):
 *   [ 12 byte IV ][ 16 byte auth tag ][ N byte ciphertext ]
 *
 * KUNCI — env CONN_SECRET_KEY (WAJIB 64 karakter hex = 32 byte):
 *   Buat sekali:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   Simpan di server/.env — JANGAN sampai berubah setelah ada koneksi
 *   tersimpan (ganti kunci = semua secretEnc lama tidak bisa didekripsi lagi).
 *
 * Kalau CONN_SECRET_KEY belum di-set:
 *   - produksi (NODE_ENV=production) → gagal boot (fail-fast, sama seperti
 *     JWT_SECRET di middlewares/auth.js).
 *   - development → turunkan kunci sementara dari JWT_SECRET (scrypt +
 *     salt tetap) supaya tetap bisa dicoba tanpa setup tambahan, sambil
 *     memberi peringatan jelas di console.
 */

import crypto from "crypto";
import { JWT_SECRET } from "../middlewares/auth.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const DEV_SALT = "dara-connections-dev-salt-v1"; // tetap, hanya untuk turunan kunci DEV

function resolveKey() {
  const hex = process.env.CONN_SECRET_KEY;
  const isProd = process.env.NODE_ENV === "production";

  if (hex) {
    const buf = Buffer.from(hex, "hex");
    if (buf.length !== 32) {
      throw new Error(
        "CONN_SECRET_KEY tidak valid — harus 64 karakter heksadesimal (32 byte). " +
        "Buat baru: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
      );
    }
    return buf;
  }

  if (isProd) {
    throw new Error(
      "CONN_SECRET_KEY wajib diisi di produksi (dipakai mengenkripsi password koneksi " +
      "database eksternal). Buat: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
      "lalu set di server/.env."
    );
  }

  console.warn(
    "[DARA] PERINGATAN: CONN_SECRET_KEY belum di-set — memakai kunci turunan " +
    "sementara dari JWT_SECRET (aman untuk coba-coba, TIDAK untuk produksi). " +
    "Set CONN_SECRET_KEY sendiri sebelum menyimpan koneksi database sungguhan."
  );
  return crypto.scryptSync(JWT_SECRET, DEV_SALT, 32);
}

let cachedKey = null;
function getKey() {
  if (!cachedKey) cachedKey = resolveKey();
  return cachedKey;
}

/** Enkripsi teks (mis. password) → satu string base64 siap disimpan di doc.secretEnc. */
export function encryptSecret(plainText) {
  if (plainText == null || plainText === "") return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plainText), "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

/** Dekripsi hasil encryptSecret(). Kembalikan null bila kosong/rusak. */
export function decryptSecret(payload) {
  if (!payload) return null;
  try {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf-8");
  } catch (err) {
    throw new Error("Gagal mendekripsi rahasia koneksi — CONN_SECRET_KEY mungkin berubah: " + err.message);
  }
}

export default { encryptSecret, decryptSecret };
