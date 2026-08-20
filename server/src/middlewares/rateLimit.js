/**
 * rateLimit.js — pembatas laju sederhana (in-memory), tanpa dependency.
 *
 * Dipakai untuk melindungi endpoint sensitif (mis. login) dari brute-force.
 * Menyimpan hitungan percobaan per kunci (IP) dalam jendela waktu.
 *
 * Batasan: in-memory → tidak berbagi antar proses/instance. Cukup untuk satu
 * instance intranet. Untuk multi-instance, ganti store dengan Redis dkk.
 *
 * SETTINGS (.env, opsional):
 *   LOGIN_RATE_MAX      maksimal percobaan per jendela (default 10)
 *   LOGIN_RATE_WINDOW_S panjang jendela dalam detik (default 900 = 15 menit)
 */

const buckets = new Map(); // key -> { count, resetAt }

/** Bersihkan entri kedaluwarsa sesekali agar Map tak membengkak. */
function sweep(now) {
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

/**
 * Buat middleware rate-limit.
 * @param {object} opts { max, windowMs, message }
 */
export function rateLimit({ max = 10, windowMs = 15 * 60 * 1000, message } = {}) {
  return function (req, res, next) {
    const now = Date.now();
    if (buckets.size > 5000) sweep(now); // jaga-jaga
    // Kunci = IP klien (hormati proxy bila ada X-Forwarded-For).
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim()
      || req.socket?.remoteAddress || "unknown";

    let b = buckets.get(ip);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, b);
    }
    b.count += 1;

    if (b.count > max) {
      const retry = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retry));
      return res.status(429).json({
        error: message || `Terlalu banyak percobaan. Coba lagi dalam ${retry} detik.`,
      });
    }
    next();
  };
}

/** Rate-limit khusus login (dari env, dengan default aman). */
export const loginRateLimit = rateLimit({
  max: Number(process.env.LOGIN_RATE_MAX) || 10,
  windowMs: (Number(process.env.LOGIN_RATE_WINDOW_S) || 900) * 1000,
  message: "Terlalu banyak percobaan login. Coba lagi beberapa saat lagi.",
});

export default rateLimit;
