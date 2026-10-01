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
  const m = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
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

/** Lowercase, trim, collapse whitespace – key used for case-insensitive lookups. */
export function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
