/**
 * acl — kontrol akses per-item (chart/dashboard/story) untuk pemakaian DARA
 * MANDIRI (B1). Item hanya bisa dibuka oleh: admin, pembuat (createdBy.nip),
 * atau NIP yang ada di `sharedWith`.
 *
 * Modul ini bisa di-ON/OFF admin (setting `aclEnabled`). Saat OFF → semua user
 * login boleh melihat semua (perilaku lama).
 *
 * CATATAN: ACL ini TIDAK berlaku untuk jalur EMBED (`/api/embed/*`) yang dipakai
 * MANDOR — di sana akses lewat kunci embed + identitas dari MANDOR. Jadi
 * mematikan ACL aman untuk skenario embed-only.
 *
 * Ini BUKAN role/RLS (filter baris) yang pernah dihapus — ini murni "siapa boleh
 * membuka item".
 */

import { usersService } from "../modules/users/users.service.js";

export function isAclEnabled() {
  return usersService.getAclEnabled();
}

/** Boleh melihat/membuka item? */
export function canAccessItem(item, user) {
  if (!isAclEnabled()) return true;      // modul mati → bebas
  if (!user) return false;
  if (user.role === "admin") return true;
  if (item && item.createdBy && item.createdBy.nip === user.nip) return true;
  return !!(item && Array.isArray(item.sharedWith) && item.sharedWith.includes(user.nip));
}

/** Saring daftar item ke yang boleh diakses user. */
export function filterAccessible(items, user) {
  if (!isAclEnabled()) return items;
  return (items || []).filter((it) => canAccessItem(it, user));
}

/** Boleh MENGUBAH berbagi (share) item? Hanya pemilik/admin. */
export function canManageItem(item, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !!(item && item.createdBy && item.createdBy.nip === user.nip);
}

// NIP: maks 30 karakter, huruf/angka/titik/garis (selaras users.service.js).
// Sebelumnya wajib persis 9 digit — dilonggarkan untuk mendukung identifier
// non-numerik (mis. username sistem eksternal yang dipetakan ke NIP).
const NIP_RE = /^[A-Za-z0-9._-]{1,30}$/;

/** Bersihkan daftar NIP yang dibagikan (format valid, unik, maks 500). */
export function sanitizeSharedWith(arr) {
  if (!Array.isArray(arr)) return [];
  return [...new Set(arr.map((n) => String(n).trim()).filter((n) => NIP_RE.test(n)))].slice(0, 500);
}

export default { isAclEnabled, canAccessItem, filterAccessible, canManageItem, sanitizeSharedWith };
