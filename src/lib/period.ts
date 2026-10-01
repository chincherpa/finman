export type Preset = "month" | "last-month" | "ytd" | "last-12" | "year" | "last-year" | "all" | "custom";

export interface Period {
  from: string; // inclusive, YYYY-MM-DD
  to: string; // inclusive, YYYY-MM-DD
  preset: Preset;
}

export const presetLabels: Record<Preset, string> = {
  month: "Dieser Monat",
  "last-month": "Letzter Monat",
  ytd: "Jahr bis heute",
  "last-12": "Letzte 12 Monate",
  year: "Dieses Jahr",
  "last-year": "Letztes Jahr",
  all: "Alles",
  custom: "Benutzerdefiniert",
};

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const endOfMonth = (y: number, m: number) => new Date(y, m + 1, 0);

export function presetRange(preset: Preset, today = new Date()): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "month":
      return { from: iso(new Date(y, m, 1)), to: iso(endOfMonth(y, m)) };
    case "last-month":
      return { from: iso(new Date(y, m - 1, 1)), to: iso(endOfMonth(y, m - 1)) };
    case "ytd":
      return { from: `${y}-01-01`, to: iso(today) };
    case "last-12":
      return { from: iso(new Date(y, m - 11, 1)), to: iso(endOfMonth(y, m)) };
    case "year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last-year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "all":
    case "custom":
      return { from: "1900-01-01", to: "2999-12-31" };
  }
}

export type SearchParams = Record<string, string | string[] | undefined>;

export function getParam(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function periodFromParams(sp: SearchParams): Period {
  const from = getParam(sp, "from");
  const to = getParam(sp, "to");
  if (from && to) return { from, to, preset: (getParam(sp, "p") as Preset) ?? "custom" };
  const preset = (getParam(sp, "p") as Preset) || "last-12";
  return { ...presetRange(preset), preset };
}

/** Move the period one step back/forward, keeping its length (month-aligned when possible). */
export function shiftPeriod(p: Period, dir: -1 | 1): { from: string; to: string } {
  const f = new Date(`${p.from}T00:00:00`);
  const t = new Date(`${p.to}T00:00:00`);
  const monthAligned = f.getDate() === 1;
  if (monthAligned) {
    const months = (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1;
    const nf = new Date(f.getFullYear(), f.getMonth() + dir * months, 1);
    const nt = endOfMonth(nf.getFullYear(), nf.getMonth() + months - 1);
    return { from: iso(nf), to: iso(nt) };
  }
  const days = Math.round((t.getTime() - f.getTime()) / 86_400_000) + 1;
  const nf = new Date(f.getTime() + dir * days * 86_400_000);
  const nt = new Date(t.getTime() + dir * days * 86_400_000);
  return { from: iso(nf), to: iso(nt) };
}

export function monthsInPeriod(p: { from: string; to: string }): string[] {
  const out: string[] = [];
  const f = new Date(`${p.from.slice(0, 7)}-01T00:00:00`);
  const t = new Date(`${p.to.slice(0, 7)}-01T00:00:00`);
  for (let d = f; d <= t; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) out.push(iso(d).slice(0, 7));
  return out;
}

export function formatPeriod(p: { from: string; to: string }): string {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString("de-DE", { month: "short", year: "numeric" });
  return fmt(p.from) === fmt(p.to) ? fmt(p.from) : `${fmt(p.from)} – ${fmt(p.to)}`;
}

/** Build a URL from current search params plus a patch (null/"" removes a key). */
export function withParams(path: string, sp: SearchParams, patch: Record<string, string | null | undefined>): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) next.set(k, val);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v) next.set(k, v);
    else next.delete(k);
  }
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}
