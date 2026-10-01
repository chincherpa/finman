"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getPayeeHistory } from "@/app/actions";
import { formatEur } from "@/lib/format";
import { StackedBars } from "@/components/charts/stacked-bars";

const ranges = [
  { id: "12", label: "12M", months: 12 },
  { id: "24", label: "24M", months: 24 },
  { id: "60", label: "5J", months: 60 },
  { id: "all", label: "Alle", months: Infinity },
] as const;

export function PayeeHistory({ payee, onClose }: { payee: string; onClose: () => void }) {
  const [data, setData] = useState<{ months: Array<{ month: string; cents: number; count: number }>; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<(typeof ranges)[number]["id"]>("all");

  useEffect(() => {
    getPayeeHistory(payee)
      .then((r) => (r.ok ? setData(r.data!) : setError(r.error)))
      .catch(() => setError("Anfrage fehlgeschlagen. Seite neu laden und erneut versuchen."));
  }, [payee]);

  const months = useMemo(() => {
    if (!data) return [];
    const n = ranges.find((r) => r.id === range)!.months;
    return Number.isFinite(n) ? data.months.slice(-n) : data.months;
  }, [data, range]);
  const total = useMemo(() => months.reduce((a, m) => a + m.cents, 0), [months]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20" onClick={onClose}>
      <div className="card flex w-[640px] flex-col gap-3 p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{payee}</h2>
            <p className="text-xs text-muted">Monatlicher Verlauf</p>
          </div>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        {error && <p className="text-[13px] text-negative">{error}</p>}
        {!data && !error && <p className="py-16 text-center text-sm text-muted">Lädt…</p>}
        {data && data.months.length === 0 && <p className="py-16 text-center text-sm text-muted">Keine Buchungen gefunden.</p>}
        {data && data.months.length > 0 && (
          <>
            <div className="flex items-center justify-between">
              <p className="num text-xs text-muted">
                {formatEur(total, { sign: true })} insgesamt · Ø {formatEur(Math.round(total / months.length), { sign: true })} pro Monat
              </p>
              <div className="seg">
                {ranges.filter((r) => r.id === "all" || r.months < data.months.length).map((r) => (
                  <button key={r.id} type="button" data-active={range === r.id} onClick={() => setRange(r.id)}>{r.label}</button>
                ))}
              </div>
            </div>
            <StackedBars
              data={months.map((m) => ({ month: m.month, Betrag: m.cents }))}
              series={[{ key: "Betrag", color: "#f0612e" }]}
            />
          </>
        )}
      </div>
    </div>
  );
}
