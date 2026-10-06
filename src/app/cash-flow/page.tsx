import { PageHeader } from "@/components/layout/page-header";
import { StatCard, Seg } from "@/components/ui/stat-card";
import { BreakdownList } from "@/components/ui/breakdown-list";
import { colorFor } from "@/components/charts/colors";
import { Sankey, type SankeyLink, type SankeyNode } from "@/components/charts/sankey";
import Link from "next/link";
import { clampPeriod, getLines, sumBy, UNCATEGORIZED, type Line } from "@/lib/queries";
import { formatDate, formatEur, formatPercent } from "@/lib/format";
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

  // ---- Selected node -> matching lines
  const sel = getParam(sp, "sel");
  let selLabel = "";
  let selLines: Line[] = [];
  if (sel) {
    selLabel = sel.startsWith("ip:") || sel.startsWith("ep:") ? sel.slice(3)
      : sel.startsWith("c:") ? sel.slice(2).split("\u0000")[0]
      : nodes.find((n) => n.name === sel)?.label ?? "";
    if (sel === "in") selLines = incomeLines;
    else if (sel === "savings") selLines = savingsLines;
    else if (sel.startsWith("ip:")) selLines = incomeLines.filter((l) => l.payee === sel.slice(3));
    else if (sel.startsWith("ep:")) selLines = expenseLines.filter((l) => l.payee === sel.slice(3));
    else if (sel.startsWith("src:")) selLines = incomeLines.filter((l) => incomeLabel(l) === sel.slice(4));
    else if (sel.startsWith("g:")) selLines = expenseLines.filter((l) => l.kat0 === sel.slice(2));
    else if (sel.startsWith("c:")) {
      const [k1, k0] = sel.slice(2).split("\u0000");
      selLines = expenseLines.filter((l) => l.kat1 === k1 && l.kat0 === k0);
    }
    selLines = [...selLines].sort((a, b) => b.date.localeCompare(a.date));
  }
  const selTotal = selLines.reduce((a, l) => a + l.amountCents, 0);

  const incomeItems = (incomeView === "merchant"
    ? sumBy(incomeLines, (l) => l.payee, 1)
    : income
  ).filter((b) => b.cents > 0).map((b) => ({
    key: b.key, cents: b.cents, color: INCOME,
    href: `${withParams("/cash-flow", sp, { sel: incomeView === "merchant" ? `ip:${b.key}` : `src:${b.key}` })}#umsaetze`,
  }));
  const expenseItems = (expenseView === "category"
    ? sumBy(expenseLines, (l) => l.kat1, -1, (l) => l.kat0)
    : expenseView === "merchant" ? sumBy(expenseLines, (l) => l.payee, -1, (l) => l.kat0) : groups
  ).filter((b) => b.cents > 0).map((b) => ({ key: b.key, cents: b.cents, color: groupColor.get(b.group ?? b.key) ?? colorFor(b.key),
    href: `${withParams("/cash-flow", sp, {
      sel: expenseView === "category" ? `c:${b.key}\u0000${b.group}` : expenseView === "merchant" ? `ep:${b.key}` : `g:${b.key}`,
    })}#umsaetze`,
  }));

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
          <>
            <Sankey nodes={nodes} links={links} selected={sel} height={Math.max(420, (nodes.length - income.length) * 36)} />
            {!sel && <p className="mt-1 text-xs text-muted">Gruppe oder Kategorie anklicken, um die Umsätze zu sehen.</p>}
          </>
        )}
      </section>

      {sel && selLabel && (
        <section id="umsaetze" className="card mb-5 scroll-mt-4 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              {selLabel} <span className="text-sm font-normal text-muted">· {selLines.length} Buchungen · {formatEur(selTotal, { sign: true })}</span>
            </h2>
            <Link href={withParams("/cash-flow", sp, { sel: null })} className="text-sm text-muted hover:underline">Schließen</Link>
          </div>
          {selLines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Keine Umsätze.</p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <tbody>
                  {selLines.map((l, i) => (
                    <tr key={`${l.txId}-${i}`} className="border-t border-black/5 first:border-t-0">
                      <td className="w-24 whitespace-nowrap py-1.5 pr-3 text-muted">{formatDate(l.date, "short")}</td>
                      <td className="py-1.5 pr-3">{l.payee}</td>
                      <td className="py-1.5 pr-3 text-muted">{l.category ?? UNCATEGORIZED}</td>
                      <td className={`whitespace-nowrap py-1.5 text-right tabular-nums ${l.amountCents >= 0 ? "text-positive" : ""}`}>
                        {formatEur(l.amountCents, { sign: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

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
