import { PageHeader } from "@/components/layout/page-header";
import { StatCard, Seg } from "@/components/ui/stat-card";
import { BreakdownList } from "@/components/ui/breakdown-list";
import { colorFor } from "@/components/charts/colors";
import { Sankey, type SankeyLink, type SankeyNode } from "@/components/charts/sankey";
import { clampPeriod, getLines, sumBy, UNCATEGORIZED } from "@/lib/queries";
import { formatEur, formatPercent } from "@/lib/format";
import { getParam, periodFromParams, withParams, type SearchParams } from "@/lib/period";

const modes = [
  { id: "groups", label: "Gruppen" },
  { id: "categories", label: "Kategorien" },
  { id: "both", label: "Beide" },
];

const INCOME = "#16a34a";

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = clampPeriod(periodFromParams(sp));
  const mode = getParam(sp, "mode") ?? "groups";
  const incomeView = getParam(sp, "iv") ?? "category";
  const expenseView = getParam(sp, "ev") ?? "group";

  const lines = getLines(period);
  const incomeLines = lines.filter((l) => l.kind === "income");
  const expenseLines = lines.filter((l) => l.kind === "expense");
  const savingsLines = lines.filter((l) => l.kind === "savings");

  const incomeLabel = (l: { kat1: string; kat0: string }) => (l.kat0 === UNCATEGORIZED ? "Sonstige (unkategorisiert)" : l.kat1 || "Einnahme");
  const income = sumBy(incomeLines, incomeLabel, 1).filter((b) => b.cents > 0);
  const incomeTotal = income.reduce((a, b) => a + b.cents, 0);
  const groups = sumBy(expenseLines, (l) => l.kat0).filter((b) => b.cents > 0);
  const expenseTotal = groups.reduce((a, b) => a + b.cents, 0);
  const savings = savingsLines.reduce((a, l) => a - l.amountCents, 0);
  const net = incomeTotal - expenseTotal - savings;
  const groupColor = new Map(groups.map((g, i) => [g.key, colorFor(g.key, i)]));

  // ---- Sankey graph
  const nodes: SankeyNode[] = [{ name: "in", label: "Einnahmen", color: INCOME, depth: 1 }];
  const links: SankeyLink[] = [];
  for (const b of income) {
    nodes.push({ name: `src:${b.key}`, label: b.key, color: INCOME, depth: 0 });
    links.push({ source: `src:${b.key}`, target: "in", value: b.cents });
  }
  if (net < 0) {
    nodes.push({ name: "src:reserve", label: "Aus Rücklagen", color: "#b9b5ac", depth: 0 });
    links.push({ source: "src:reserve", target: "in", value: -net });
  }
  if (mode === "categories") {
    for (const c of sumBy(expenseLines, (l) => `${l.kat1}\u0000${l.kat0}`, -1, (l) => l.kat0).filter((b) => b.cents > 0)) {
      const [k1, k0] = c.key.split("\u0000");
      nodes.push({ name: `c:${c.key}`, label: k1, color: groupColor.get(k0) ?? colorFor(k0), depth: 2 });
      links.push({ source: "in", target: `c:${c.key}`, value: c.cents });
    }
  } else {
    for (const g of groups) {
      nodes.push({ name: `g:${g.key}`, label: g.key, color: groupColor.get(g.key)!, depth: 2 });
      links.push({ source: "in", target: `g:${g.key}`, value: g.cents });
    }
    if (mode === "both") {
      for (const c of sumBy(expenseLines, (l) => `${l.kat1}\u0000${l.kat0}`, -1, (l) => l.kat0).filter((b) => b.cents > 0)) {
        const [k1, k0] = c.key.split("\u0000");
        if (!groupColor.has(k0)) continue;
        nodes.push({ name: `c:${c.key}`, label: k1, color: groupColor.get(k0)!, depth: 3 });
        links.push({ source: `g:${k0}`, target: `c:${c.key}`, value: c.cents });
      }
    }
  }
  if (savings > 0) {
    nodes.push({ name: "savings", label: "Sparen", color: "#0ea5a4", depth: 2 });
    links.push({ source: "in", target: "savings", value: savings });
  }
  if (net > 0) {
    nodes.push({ name: "surplus", label: "Überschuss", color: "#86efac", depth: 2 });
    links.push({ source: "in", target: "surplus", value: net });
  }

  const incomeItems = (incomeView === "merchant"
    ? sumBy(incomeLines, (l) => l.payee, 1)
    : income
  ).filter((b) => b.cents > 0).map((b) => ({ key: b.key, cents: b.cents, color: INCOME }));
  const expenseItems = (expenseView === "category"
    ? sumBy(expenseLines, (l) => l.kat1, -1, (l) => l.kat0)
    : expenseView === "merchant" ? sumBy(expenseLines, (l) => l.payee, -1, (l) => l.kat0) : groups
  ).filter((b) => b.cents > 0).map((b) => ({ key: b.key, cents: b.cents, color: groupColor.get(b.group ?? b.key) ?? colorFor(b.key) }));

  return (
    <>
      <PageHeader title="Cashflow" subtitle="Wohin das Geld geflossen ist" period={period} />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Einnahmen" dot={INCOME} value={formatEur(incomeTotal)} />
        <StatCard label="Ausgaben" dot="var(--negative)" value={formatEur(expenseTotal)} />
        <StatCard label="Gespart" dot="#0ea5a4" value={formatEur(savings)} />
        <StatCard
          label="Saldo"
          value={<span className={net >= 0 ? "text-positive" : "text-negative"}>{formatEur(net, { sign: true })}</span>}
          hint={incomeTotal ? `Sparquote ${formatPercent(Math.max(net + savings, 0), incomeTotal)}` : undefined}
        />
      </div>

      <section className="card mb-5 p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Wohin das Geld ging</h2>
          <Seg options={modes} value={mode} hrefFor={(id) => withParams("/cash-flow", sp, { mode: id })} />
        </div>
        {links.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">Keine Daten im Zeitraum.</p>
        ) : (
          <Sankey nodes={nodes} links={links} height={Math.max(420, (nodes.length - income.length) * 36)} />
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Einnahmen</h2>
            <Seg options={[{ id: "category", label: "Kategorie" }, { id: "merchant", label: "Auftraggeber" }]} value={incomeView}
              hrefFor={(id) => withParams("/cash-flow", sp, { iv: id })} />
          </div>
          <BreakdownList items={incomeItems} total={incomeTotal} max={12} />
        </section>
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Ausgaben</h2>
            <Seg options={[{ id: "group", label: "Gruppe" }, { id: "category", label: "Kategorie" }, { id: "merchant", label: "Empfänger" }]}
              value={expenseView} hrefFor={(id) => withParams("/cash-flow", sp, { ev: id })} />
          </div>
          <BreakdownList items={expenseItems} total={expenseTotal} max={12} />
        </section>
      </div>
    </>
  );
}
