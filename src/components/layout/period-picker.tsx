"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { formatPeriod, iso, presetLabels, shiftPeriod, type Period, type Preset } from "@/lib/period";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const PRESETS = (Object.keys(presetLabels) as Preset[]).filter((p) => p !== "custom");

export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const rootRef = useRef<HTMLDivElement>(null);

  const isAll = period.preset === "all";
  const today = new Date();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete("month");
    router.push(`${pathname}?${next}`);
    setOpen(false);
  };

  const shift = (dir: -1 | 1) => {
    const r = shiftPeriod(period, dir);
    go({ from: r.from, to: r.to, p: "custom" });
  };

  const range = (from: string, to: string) => go({ from, to, p: "custom" });
  const monthRange = (y: number, m: number) => range(iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0)));
  const yearRange = (y: number) => range(`${y}-01-01`, `${y}-12-31`);

  const isMonthActive = (m: number) =>
    period.from === iso(new Date(year, m, 1)) && period.to === iso(new Date(year, m + 1, 0));
  const isYearActive = period.from === `${year}-01-01` && period.to === `${year}-12-31`;

  const label = isAll ? "Gesamter Zeitraum" : formatPeriod(period);
  const presetName = period.preset !== "custom" ? presetLabels[period.preset] : null;

  return (
    <div className="flex items-center gap-2" ref={rootRef}>
      <button className="btn px-2" onClick={() => shift(-1)} disabled={isAll} aria-label="Zurück">
        <ChevronLeft size={15} />
      </button>

      <div className="relative">
        <button className="btn gap-2" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
          <CalendarDays size={14} />
          <span className="num text-[13px] font-medium">{label}</span>
          {presetName && !isAll && <span className="text-xs text-muted">· {presetName}</span>}
          <ChevronDown size={13} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div role="dialog" className="card absolute right-0 z-30 mt-1 flex w-[340px] flex-col gap-4 p-4 shadow-lg">
            <section>
              <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">Schnellauswahl</h4>
              <div className="grid grid-cols-2 gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    className={`btn justify-start ${period.preset === p ? "bg-accent-soft text-accent" : ""}`}
                    onClick={() => go({ p, from: null, to: null })}
                  >
                    {presetLabels[p]}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted">Monat / Jahr</h4>
                <div className="flex items-center gap-1">
                  <button className="btn px-1.5 py-0.5" onClick={() => setYear((y) => y - 1)} aria-label="Vorheriges Jahr">
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    className={`btn num px-2 py-0.5 ${isYearActive ? "bg-accent-soft text-accent" : ""}`}
                    onClick={() => yearRange(year)}
                    title="Ganzes Jahr wählen"
                  >
                    {year}
                  </button>
                  <button className="btn px-1.5 py-0.5" onClick={() => setYear((y) => y + 1)} aria-label="Nächstes Jahr">
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {MONTHS.map((name, m) => {
                  const future = year > today.getFullYear() || (year === today.getFullYear() && m > today.getMonth());
                  return (
                    <button
                      key={name}
                      className={`btn justify-center ${isMonthActive(m) ? "bg-accent-soft text-accent" : ""} ${future ? "text-muted" : ""}`}
                      onClick={() => monthRange(year, m)}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </section>

            <form
              className="flex flex-col gap-2 border-t border-border pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const from = String(fd.get("from"));
                const to = String(fd.get("to"));
                if (from > to) range(to, from);
                else range(from, to);
              }}
            >
              <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted">Eigener Zeitraum</h4>
              <div className="grid grid-cols-2 gap-2">
                <input name="from" type="date" className="input" defaultValue={isAll ? "" : period.from} required aria-label="Von" />
                <input name="to" type="date" className="input" defaultValue={isAll ? "" : period.to} required aria-label="Bis" />
              </div>
              <button className="btn btn-primary justify-center">Anwenden</button>
            </form>
          </div>
        )}
      </div>

      <button className="btn px-2" onClick={() => shift(1)} disabled={isAll} aria-label="Weiter">
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
