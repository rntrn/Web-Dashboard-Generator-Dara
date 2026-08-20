/**
 * Logo DARA — mark bar-chart naik + spark, gradien teal→sky→indigo, ANIMASI.
 *  - batang tumbuh dari bawah (stagger) lalu mengambang halus
 *  - spark (titik kuning) berkedip
 *  - kilau (shine) menyapu melintasi kotak
 * Props: size (px), withText (wordmark), textClass, animated (default true).
 * Animasi didefinisikan di index.css (.dara-bar/.dara-spark/.dara-shine),
 * dan otomatis mati bila pengguna memilih prefers-reduced-motion.
 */
export default function Logo({
  size = 32, withText = false, textClass = "", animated = true,
  name = "DARA", tagline = "DASHBOARD & REPORTING GENERATOR", image = "",
}) {
  return (
    <div className="flex items-center gap-2.5">
      {image ? (
        <img src={image} alt="logo" width={size} height={size}
          className="shrink-0 rounded-[16px]" style={{ width: size, height: size, objectFit: "contain" }} />
      ) : (
      <div className="relative shrink-0 overflow-hidden rounded-[16px]" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 64 64">
          <defs>
            <linearGradient id="daraLogo" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#14b8a6" />
              <stop offset="0.5" stopColor="#0ea5e9" />
              <stop offset="1" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#daraLogo)" />
          {/* batang chart (tumbuh + mengambang, dengan jeda berurutan) */}
          <rect className={animated ? "dara-bar" : ""} style={{ animationDelay: "0s, .7s" }}
            x="16" y="34" width="7" height="14" rx="2" fill="#fff" opacity="0.95" />
          <rect className={animated ? "dara-bar" : ""} style={{ animationDelay: ".12s, .9s" }}
            x="28" y="26" width="7" height="22" rx="2" fill="#fff" opacity="0.95" />
          <rect className={animated ? "dara-bar" : ""} style={{ animationDelay: ".24s, 1.1s" }}
            x="40" y="18" width="7" height="30" rx="2" fill="#fff" opacity="0.95" />
          {/* spark berkedip */}
          <circle className={animated ? "dara-spark" : ""} cx="43.5" cy="14" r="3.4" fill="#fde047" />
        </svg>
        {/* kilau menyapu */}
        {animated && (
          <span className="dara-shine pointer-events-none absolute inset-y-0 -left-4 w-5"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,.65), transparent)" }} />
        )}
      </div>
      )}
      {withText && (
        <div className="leading-none">
          <div className={`font-black tracking-tight text-xl ${textClass}`}>{name}</div>
          <div className="text-[9px] text-slate-400 tracking-[0.12em] mt-0.5 uppercase">
            {tagline}
          </div>
        </div>
      )}
    </div>
  );
}
