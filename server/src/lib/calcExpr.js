/**
 * calcExpr — calculated field: ubah ekspresi aritmetika aman menjadi SQL.
 *
 * TUJUAN KEAMANAN: mencegah injeksi. Hanya token berikut yang diizinkan:
 *   - identifier kolom  : /^[A-Za-z_][A-Za-z0-9_]*$/  (di-quote sesuai driver)
 *   - angka             : 123 / 12.5
 *   - operator          : + - * / %
 *   - kurung            : ( )
 * Selain itu (kutip, titik-koma, koma, fungsi, kata kunci) → DITOLAK.
 * Identifier selalu dibungkus quote, jadi tak bisa "kabur" jadi SQL lain.
 *
 * Pengutipan identifier didelegasikan ke lib/dialect.js supaya sintaks MySQL
 * (backtick) dan SQLite (kutip ganda) tidak ditulis ulang di sini.
 *
 * Dipakai measure "calculated" di chart, mis. "line_total / quantity" →
 * `("line_total" / "quantity")` lalu dibungkus agregasi: SUM((...)).
 */

const TOKEN_RE = /[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?|[()+\-*/%]|\s+/y;
import { ident as quoteIdent } from "./dialect.js";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPS = new Set(["+", "-", "*", "/", "%"]);

/** Pecah ekspresi jadi token; lempar Error bila ada karakter tak diizinkan. */
export function tokenizeCalc(expr) {
  const s = String(expr || "");
  const tokens = [];
  let pos = 0;
  while (pos < s.length) {
    TOKEN_RE.lastIndex = pos;
    const m = TOKEN_RE.exec(s);
    if (!m || m.index !== pos) {
      throw new Error(`Karakter tidak valid pada posisi ${pos + 1}`);
    }
    if (!/^\s+$/.test(m[0])) tokens.push(m[0]); // buang whitespace
    pos = TOKEN_RE.lastIndex;
  }
  return tokens;
}

/**
 * Validasi & bangun SQL dari ekspresi calculated field.
 * @param {string} expr
 * @param {object} opts
 * @param {"mysql"|"sqlite"} [opts.dbType="mysql"]
 * @param {string[]} [opts.allowedCols] daftar nama kolom valid (opsional).
 *        Jika diberikan, identifier yang tak ada di sini ditolak (case-insensitive).
 * @returns {{ sql: string, columns: string[] }}
 */
export function buildCalcSql(expr, { dbType = "mysql", allowedCols = null } = {}) {
  const tokens = tokenizeCalc(expr);
  if (tokens.length === 0) throw new Error("Ekspresi kosong");

  const ident = (name) => quoteIdent(name, dbType);
  const colMap = allowedCols
    ? new Map(allowedCols.map((c) => [c.toLowerCase(), c]))
    : null;

  let depth = 0;
  const used = new Set();
  let prev = null; // token sebelumnya
  // Operand = sesuatu yang menghasilkan nilai (angka, kolom, atau ")").
  const isOperandEnd = (p) => p != null && (p === ")" || /^\d/.test(p) || IDENT_RE.test(p));

  const out = tokens.map((t) => {
    if (t === "(") {
      // Cegah "SUM(...)" / "a(...)" / "2(...)" → tak ada pemanggilan fungsi.
      if (isOperandEnd(prev)) throw new Error("Tanda kurung setelah operand tidak diizinkan");
      depth++; prev = t; return "(";
    }
    if (t === ")") {
      depth--; if (depth < 0) throw new Error("Kurung tidak seimbang");
      if (prev === "(" || OPS.has(prev)) throw new Error("Kurung kosong / operator menggantung");
      prev = t; return ")";
    }
    if (OPS.has(t)) {
      if (!isOperandEnd(prev)) throw new Error("Operator di posisi tidak valid");
      prev = t; return ` ${t} `;
    }
    // operand (angka / identifier): tak boleh langsung setelah operand lain
    if (isOperandEnd(prev)) throw new Error("Dua operand berdampingan tanpa operator");
    if (/^\d/.test(t)) { prev = t; return t; } // angka
    if (!IDENT_RE.test(t)) throw new Error(`Token tidak valid: ${t}`);
    let name = t;
    if (colMap) {
      const actual = colMap.get(t.toLowerCase());
      if (!actual) throw new Error(`Kolom tidak dikenal: ${t}`);
      name = actual;
    }
    used.add(name);
    prev = t;
    return ident(name);
  });

  if (depth !== 0) throw new Error("Kurung tidak seimbang");
  if (prev && OPS.has(prev)) throw new Error("Ekspresi berakhir dengan operator");
  if (used.size === 0) throw new Error("Ekspresi harus memakai minimal satu kolom");

  return { sql: `(${out.join("")})`, columns: [...used] };
}

export default buildCalcSql;
