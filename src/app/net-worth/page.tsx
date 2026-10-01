import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { NetWorthChart } from "@/components/charts/line-chart";
import { accountBalances, clampPeriod, loanStatuses } from "@/lib/queries";
import { formatEur } from "@/lib/format";
import { iso, monthsInPeriod, periodFromParams, type SearchParams } from "@/lib/period";
import type { AccountType } from "@/db/schema";

const typeLabels: Record<AccountType, string> = {
  checking: "Girokonten", savings: "Sparkonten", cash: "Bargeld", depot: "Depots", loan: "Kreditkonten", asset: "Sachwerte",
};

export default async function NetWorthPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = clampPeriod(periodFromParams(sp));
  const balances = accountBalances(period).filter((b) => b.account.includeInNetWorth);
  const loans = loanStatuses();
  const today = iso(new Date()).slice(0, 7);
  const months = monthsInPeriod(period).filter((m) => m <= today);

  const liabilities = loans.filter((l) => l.loan.isLiability).reduce((a, l) => a + l.remainingCents, 0);
  const lent = loans.filter((l) => !l.loan.isLiability).reduce((a, l) => a + l.remainingCents, 0);
  const assets = balances.reduce((a, b) => a + (b.balanceCents ?? 0), 0) + lent;
  const netWorth = assets - liabilities;

  // Loans are shown at today's value for the whole series (payments history would need per-month replay).
  const series = months
    .map((m) => {
      let any = false;
      let v = lent - liabilities;
      for (const b of balances) {
        const x = b.series.get(m);
        if (x != null) { v += x; any = true; }
      }
      return any ? { month: m, value: v } : null;
    })
    .filter((x): x is { month: string; value: number } => !!x);

  const groups = Map.groupBy(balances, (b) => b.account.type);

  return (
    <>
      <PageHeader title="Vermögen" subtitle="Kontostände aus „Endsaldo“-Zeilen und manuellen Ständen, fortgeschrieben mit Umsätzen." period={period} />
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Nettovermögen" value={formatEur(netWorth)} hint={`Stand ${new Date().toLocaleDateString("de-DE")}`} />
        <StatCard label="Vermögenswerte" dot="var(--positive)" value={formatEur(assets)} />
        <StatCard label="Verbindlichkeiten" dot="var(--negative)" value={formatEur(liabilities)} />
      </div>

      <section className="card mb-5 p-5">
        <h2 className="mb-3 font-semibold">Verlauf (Monatsende)</h2>
        {series.length ? <NetWorthChart data={series} /> : <p className="py-10 text-center text-sm text-muted">Noch keine Kontostände. CSV importieren oder Stand unter Konten erfassen.</p>}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Vermögenswerte</h2>
          {[...groups.entries()].map(([type, list]) => (
            <div key={type} className="mb-4">
              <div className="mb-1 flex justify-between text-xs font-medium text-muted">
                <span>{typeLabels[type]}</span>
                <span className="num">{formatEur(list.reduce((a, b) => a + (b.balanceCents ?? 0), 0))}</span>
              </div>
              {list.map((b) => (
                <Link key={b.account.id} href={`/accounts#a${b.account.id}`} className="flex justify-between rounded-md px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
                  <span>{b.account.name}</span>
                  <span className="num font-medium">{b.balanceCents == null ? "–" : formatEur(b.balanceCents)}</span>
                </Link>
              ))}
            </div>
          ))}
          {lent > 0 && (
            <div className="flex justify-between px-2 py-1.5 text-[13.5px]"><span>Verliehenes Geld</span><span className="num font-medium">{formatEur(lent)}</span></div>
          )}
        </section>
        <section className="card p-5">
          <h2 className="mb-3 font-semibold">Verbindlichkeiten</h2>
          {loans.filter((l) => l.loan.isLiability).map((l) => (
            <Link key={l.loan.id} href="/loans" className="flex justify-between rounded-md px-2 py-1.5 text-[13.5px] hover:bg-surface-2">
              <span>{l.loan.name}</span><span className="num font-medium text-negative">{formatEur(-l.remainingCents)}</span>
            </Link>
          ))}
          {!loans.some((l) => l.loan.isLiability) && <p className="text-sm text-muted">Keine Kredite erfasst.</p>}
        </section>
      </div>
    </>
  );
}
