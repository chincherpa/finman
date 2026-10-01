"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatPeriod, presetLabels, shiftPeriod, type Period, type Preset } from "@/lib/period";

export function PeriodPicker({ period }: { period: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete("month");
    router.push(`${pathname}?${next}`);
  };

  const shift = (dir: -1 | 1) => {
    const r = shiftPeriod(period, dir);
    go({ from: r.from, to: r.to, p: "custom" });
  };

  const isAll = period.preset === "all";

  return (
    <div className="flex items-center gap-2">
      <button className="btn px-2" onClick={() => shift(-1)} disabled={isAll} aria-label="Zurück">
        <ChevronLeft size={15} />
      </button>
      <span className="num min-w-36 text-center text-[13px] font-medium">
        {isAll ? "Gesamter Zeitraum" : formatPeriod(period)}
      </span>
      <button className="btn px-2" onClick={() => shift(1)} disabled={isAll} aria-label="Weiter">
        <ChevronRight size={15} />
      </button>
      <label className="btn relative">
        <CalendarDays size={14} />
        <select
          className="cursor-pointer appearance-none bg-transparent pr-1 outline-none"
          value={period.preset}
          onChange={(e) => {
            const p = e.target.value as Preset;
            if (p === "custom") return;
            go({ p, from: null, to: null });
          }}
        >
          {(Object.keys(presetLabels) as Preset[]).map((p) => (
            <option key={p} value={p} disabled={p === "custom"}>
              {presetLabels[p]}
            </option>
          ))}
        </select>
      </label>
      <details className="relative">
        <summary className="btn cursor-pointer list-none">Von–Bis</summary>
        <form
          className="card absolute right-0 z-20 mt-1 flex w-64 flex-col gap-2 p-3 shadow-lg"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            go({ from: String(fd.get("from")), to: String(fd.get("to")), p: "custom" });
            (e.currentTarget.parentElement as HTMLDetailsElement).open = false;
          }}
        >
          <label className="label">Von<input name="from" type="date" className="input mt-1" defaultValue={isAll ? "" : period.from} required /></label>
          <label className="label">Bis<input name="to" type="date" className="input mt-1" defaultValue={isAll ? "" : period.to} required /></label>
          <button className="btn btn-primary justify-center">Anwenden</button>
        </form>
      </details>
    </div>
  );
}
