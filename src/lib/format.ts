/** Parse German formatted number ("-1.000,00", "4.989,09") into integer cents. */
export function parseGermanAmount(value: string): number {
  const s = value.trim().replace(/\./g, "").replace(",", ".");
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Invalid amount: "${value}"`);
  return Math.round(n * 100);
}

/** "05.01.2026" → "2026-01-05". Returns null for empty input. */
export function parseGermanDate(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)/);
  if (!m) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Number(year), month, 0).getDate()) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "05.01.2026 17:58" → "2026-01-05T17:58". */
export function parseGermanDateTime(value: string): string | null {
  const date = parseGermanDate(value);
  if (!date) return null;
  const t = value.trim().match(/\s(\d{2}):(\d{2})/);
  return `${date}T${t ? `${t[1]}:${t[2]}` : "00:00"}`;
}

const eur = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
const eurShort = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatEur(cents: number, opts: { short?: boolean; sign?: boolean } = {}): string {
  const s = (opts.short ? eurShort : eur).format(cents / 100);
  return opts.sign && cents > 0 ? `+${s}` : s;
}

export function formatDate(iso: string, style: "long" | "short" = "long"): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return d.toLocaleDateString("de-DE", style === "long"
    ? { weekday: "short", day: "2-digit", month: "short", year: "numeric" }
    : { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatPercent(part: number, total: number): string {
  if (!total) return "0,0 %";
  return `${((part / total) * 100).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Parse a user-typed amount to cents: "1.234,50" / "12,5" / "12.50" / "1.234" (thousands) / "-3". */
export function parseAmountInput(value: string): number {
  const v = value.replace(/[€\s]/g, "");
  if (v === "" || v === "-") throw new Error(`Ungültiger Betrag: "${value}"`);
  let n: number;
  if (v.includes(",")) n = parseGermanAmount(v);
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(v)) n = Math.round(Number(v.replace(/\./g, "")) * 100); // "1.234" = 1234 €
  else n = Math.round(Number(v) * 100);
  if (Number.isNaN(n)) throw new Error(`Ungültiger Betrag: "${value}"`);
  return n;
}

/** Lowercase, trim, collapse whitespace – key used for case-insensitive lookups. */
export function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
