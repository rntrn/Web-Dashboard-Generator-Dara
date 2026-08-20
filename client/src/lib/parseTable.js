/**
 * parseTable — baca CSV/Excel di browser jadi { columns, rows, sheetNames, sheet }.
 * + pemindaian keamanan (formula/script injection) & pembersihannya.
 *
 * CSV di-parse tanpa dependency. Excel via SheetJS (`xlsx`, import dinamis) —
 * mendukung banyak sheet (bisa dipilih). Bila `xlsx` belum terpasang, lempar
 * pesan agar user `npm install xlsx`.
 */

/** Parser CSV sederhana, tahan kutip ganda ("a,b", ""escaped""). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  while (rows.length && rows[rows.length - 1].every((v) => v === "")) rows.pop();
  if (rows.length === 0) return { columns: [], rows: [] };
  const columns = rows[0].map((h, i) => String(h || `kolom${i + 1}`).trim());
  return { columns, rows: rows.slice(1) };
}

async function loadXLSX() {
  try { return await import("xlsx"); }
  catch { throw new Error("Dukungan Excel butuh paket 'xlsx'. Jalankan: npm install xlsx (folder client), atau unggah CSV."); }
}

/** Daftar nama sheet pada file Excel. */
export async function listSheets(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", bookSheets: true });
  return wb.SheetNames || [];
}

/** Parse sheet tertentu (atau pertama) sebuah file Excel. */
async function parseXlsx(file, sheetName) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheetNames = wb.SheetNames || [];
  const name = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  const ws = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });
  if (!aoa.length) return { columns: [], rows: [], sheetNames, sheet: name };
  const columns = aoa[0].map((h, i) => String(h || `kolom${i + 1}`).trim());
  const rows = aoa.slice(1).map((r) => columns.map((_, i) => (r[i] == null ? "" : String(r[i]))));
  return { columns, rows, sheetNames, sheet: name };
}

/** Deteksi jenis lalu parse. sheetName opsional (Excel). */
export async function parseFile(file, sheetName) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "csv" || ext === "txt") {
    const { columns, rows } = parseCsv(await file.text());
    return { columns, rows, sheetNames: ["(CSV)"], sheet: "(CSV)" };
  }
  if (ext === "xlsx" || ext === "xls") return parseXlsx(file, sheetName);
  throw new Error("Format tidak didukung. Gunakan CSV atau Excel (.xlsx).");
}

// ---- Keamanan ----
const isNum = (v) => v !== "" && v != null && /^-?\d+(\.\d+)?$/.test(String(v).trim());
// Formula injection: sel TEKS (bukan angka) diawali = + - @ atau tab/CR.
const isFormula = (s) => /^[=+@\t\r-]/.test(s) && !isNum(s);
// Script/HTML berbahaya bila kelak dirender/di-export.
const SCRIPT_RE = /<\s*script|<\s*iframe|javascript:\s*|on\w+\s*=\s*["']/i;
// Karakter kontrol (selain tab/newline) — didefinisikan tanpa byte literal.
const CTRL_RE = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");

/**
 * Pindai data. @returns { formula, script, total, samples:[{r,c,value,kind}] }
 */
export function scanData(columns, rows) {
  let formula = 0, script = 0;
  const samples = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const v = rows[r][c];
      if (v == null || v === "") continue;
      const s = String(v);
      let kind = null;
      if (isFormula(s)) { formula++; kind = "formula"; }
      else if (SCRIPT_RE.test(s)) { script++; kind = "script"; }
      if (kind && samples.length < 8)
        samples.push({ r: r + 1, c: columns[c] || `kol${c + 1}`, value: s.slice(0, 60), kind });
    }
  }
  return { formula, script, total: formula + script, samples };
}

/** Bersihkan sel berisiko: netralkan formula (prefix '), buang tag script & kontrol. */
export function sanitizeRows(rows) {
  return rows.map((row) => row.map((v) => {
    if (v == null || v === "") return v;
    let s = String(v);
    if (isFormula(s)) s = "'" + s;              // Excel memperlakukan '... sebagai teks
    s = s.replace(SCRIPT_RE, "[dihapus]");
    s = s.replace(CTRL_RE, "");
    return s.slice(0, 10000);                    // batasi panjang sel
  }));
}

export default parseFile;
