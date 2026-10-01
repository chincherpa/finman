import { PageHeader } from "@/components/layout/page-header";
import { StatCard, Seg } from "@/components/ui/stat-card";
import { BreakdownList } from "@/components/ui/breakdown-list";
import { Donut } from "@/components/charts/donut";
import { colorFor } from "@/components/charts/colors";
import { SpendingTrend } from "./trend";
import { clampPeriod, getLines, monthlyByKey, sumBy, type Line } from "@/lib/queries";
import { formatEur, formatPercent } from "@/lib/format";
import { getParam, monthsInPeriod, periodFromParams, withParams, type SearchParams } from "@/lib/period";

const views = [
  { id: "groups", label: "Gruppen" },
  { id: "categories", label: "Kategorien" },
  { id: "merchants", label: "Empfänger" },
];

export default async function SpendingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = clampPeriod(periodFromParams(sp));
  const view = getParam(sp, "view") ?? "groups";
  const lines = getLines(period).filter((l) => l.kind === "expense");

  const total = lines.reduce((a, l) => a - l.amountCents, 0);
  // Average over months that actually have bookings (first → last), so stale imports don't dilute it.
  const active = [...new Set(lines.map((l) => l.month))].sort();
  const monthCount = active.length ? monthsInPeriod({ from: `${active[0]}-01`, to: `${active.at(-1)}-01` }).length : 1;
  const groups = sumBy(lines, (l) => l.kat0);
  const fixed = lines.filter((l) => l.fixed).reduce((a, l) => a - l.amountCents, 0);
  const txCount = new Set(lines.map((l) => l.txId)).size;

  const groupColor = new Map(groups.map((g, i) => [g.key, colorFor(g.key, i)]));
  const keyFn: Record<string, (l: Line) => string> = {
    groups: (l) => l.kat0,
    categories: (l) => `${l.kat1}\u0000${l.kat0}`,
    merchants: (l) => l.payee,
  };
  const buckets = sumBy(lines, keyFn[view] ?? keyFn.groups, -1, (l) => l.kat0).filter((b) => b.cents > 0);
  const items = buckets.map((b) => {
    const [name, group] = b.key.split("\u0000");
    const filter = view === "groups" ? { kat0: name } : view === "merchants" ? { payee: name } : { kat0: group, kat1: name };
    return {
      key: name,
      sub: view === "groups" ? `${b.count} Buchungen` : b.group,
      cents: b.cents,
      color: groupColor.get(b.group ?? name) ?? colorFor(name),
      href: withParams("/transactions", sp, { view: null, ...filter }),
    };
  });

  // Trend: top 6 groups, rest as "Andere".
  const top = groups.slice(0, 6).map((g) => g.key);
  const trend = monthlyByKey(lines, period, (l) => (top.includes(l.kat0) ? l.kat0 : "Andere"));
  const series = [...top, ...(groups.length > 6 ? ["Andere"] : [])].map((k) => ({ key: k, color: groupColor.get(k) ?? colorFor("Andere") }));

  return (
    <>
      <PageHeader title="Ausgaben" subtitle="Ohne Umbuchungen, Sparen und Einnahmen; Erstattungen sind verrechnet." period={period} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Ausgaben gesamt" dot="var(--negative)" value={formatEur(total)} />
        <StatCard label="Ø pro Monat" value={formatEur(Math.round(total / monthCount))} hint={`${monthCount} Monate`} />
        <StatCard label="Größte Gruppe" value={groups[0]?.key ?? "–"} hint={groups[0] ? `${formatPercent(groups[0].cents, total)} der Ausgaben` : undefined} />
        <StatCard label="Fixkosten / Monat" value={formatEur(Math.round(fixed / monthCount))} hint={`${formatPercent(fixed, total)} der Ausgaben`} />
        <StatCard label="Buchungen" value={txCount} />
      </div>

      <section className="card mb-5 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Aufteilung</h2>
          <Seg options={views} value={view} hrefFor={(id) => withParams("/spending", sp, { view: id })} />
        </div>
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Keine Ausgaben im Zeitraum.</p>
        ) : (
          <div className="grid gap-8 md:grid-cols-[260px_1fr]">
            <div className="flex flex-col items-center gap-4">
              <Donut total={total} data={groups.filter((g) => g.cents > 0).map((g) => ({ key: g.key, cents: g.cents, color: groupColor.get(g.key)! }))} />
              <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted">
                {groups.filter((g) => g.cents > 0).map((g) => (
                  <li key={g.key} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: groupColor.get(g.key) }} />{g.key}</li>
                ))}
              </ul>
            </div>
            <div className="max-h-[520px] overflow-y-auto pr-2">
              <BreakdownList items={items} total={total} />
            </div>
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="font-semibold">Verlauf</h2>
        <p className="mb-3 text-xs text-muted">Monat anklicken, um die Umsätze zu sehen.</p>
        <SpendingTrend data={trend} series={series} />
      </section>
    </>
  );
}
