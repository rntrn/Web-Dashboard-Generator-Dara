/**
 * UI Kit — komponen tampilan bersama agar semua layar DARA konsisten.
 * Satu sumber gaya: header halaman, kartu, tombol, empty state, spinner, badge.
 * Ubah di sini = berubah di seluruh aplikasi.
 */

/**
 * Judul halaman standar (dipakai di tiap tab).
 * v0.40.0: aksen bar disederhanakan dari gradien 2 warna (teal→sky) jadi
 * satu warna aksen tema (var(--dara-accent)) — konsisten dengan prinsip
 * "satu aksen, bukan warna-warni" di seluruh tampilan.
 */
export function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3">
        <span className="mt-1.5 w-1 h-8 rounded-full shrink-0" style={{ background: "var(--dara-accent)" }} />
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">{title}</h1>
          {subtitle && <p className="text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

/**
 * Kartu putih standar (rounded-xl, garis tipis, tanpa shadow default).
 * `hover` = beri efek angkat lembut (untuk kartu yang bisa diklik/interaktif).
 */
export function Card({ className = "", hover = false, children, ...rest }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 ${hover ? "dara-card-hover" : ""} ${className}`} {...rest}>
      {children}
    </div>
  );
}

/**
 * Tombol dengan varian konsisten.
 * v0.40.0: `primary`/`solid` dijadikan warna aksen tema SOLID (bukan
 * gradien 2 warna) — lebih tenang, tetap jelas jadi aksi utama.
 */
export function Btn({ variant = "ghost", className = "", style, children, ...rest }) {
  const base = "px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[.98] disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    primary: "text-white hover:opacity-90",
    solid:   "text-white hover:opacity-90",
    outline: "border text-[color:var(--dara-accent)] hover:bg-gray-50",
    ghost:   "border border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-900",
    danger:  "border border-red-300 text-red-600 hover:bg-red-50",
  };
  const accentStyle = (variant === "primary" || variant === "solid")
    ? { background: "var(--dara-accent)", ...style }
    : variant === "outline"
      ? { borderColor: "var(--dara-accent)", ...style }
      : style;
  return <button className={`${base} ${styles[variant]} ${className}`} style={accentStyle} {...rest}>{children}</button>;
}

/** Spinner + label (aksen tema). */
export function Spinner({ label = "Memuat…" }) {
  return (
    <div className="flex items-center justify-center p-10 text-gray-500">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: "var(--dara-accent)", borderTopColor: "transparent" }} />
      <span className="ml-3 text-sm">{label}</span>
    </div>
  );
}

/** Empty state dengan ikon + ajakan (lingkaran netral datar, bukan gradien). */
export function EmptyState({ icon = "✨", title, hint }) {
  return (
    <Card className="p-12 text-center border-dashed">
      <div className="mx-auto mb-3 w-16 h-16 rounded-2xl flex items-center justify-center text-3xl bg-gray-50 border border-gray-200">
        {icon}
      </div>
      <p className="text-gray-700 font-semibold mb-1">{title}</p>
      {hint && <p className="text-gray-400 text-sm max-w-md mx-auto">{hint}</p>}
    </Card>
  );
}

/** Badge kecil (tipe chart, role, dll). */
export function Badge({ children, color = "blue" }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600",
    teal: "bg-teal-50 text-teal-700",
    gray: "bg-gray-100 text-gray-600",
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-600",
    violet: "bg-violet-100 text-violet-700",
    amber: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${colors[color] || colors.blue}`}>
      {children}
    </span>
  );
}

/** Banner pesan (error / info / success / warning). */
export function Notice({ children, kind = "error" }) {
  if (!children) return null;
  const styles = {
    error:   "bg-red-50 border-red-200 text-red-700",
    info:    "bg-blue-50 border-blue-200 text-blue-700",
    success: "bg-green-50 border-green-200 text-green-700",
    warning: "bg-amber-50 border-amber-200 text-amber-700",
  };
  return <div className={`border rounded-lg px-4 py-3 text-sm ${styles[kind] || styles.error}`}>{children}</div>;
}
