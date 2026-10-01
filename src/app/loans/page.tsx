import { PageHeader } from "@/components/layout/page-header";
import { loanStatuses } from "@/lib/queries";
import { formatDate, formatEur, formatPercent } from "@/lib/format";
import { LoanForm } from "./loan-form";

export default function LoansPage() {
  const loans = loanStatuses();
  return (
    <>
      <PageHeader title="Kredite" subtitle="Tilgungen werden über einen Suchtext in Empfänger/Verwendungszweck erkannt (z. B. „Tilgung Wilhelm-Blos“)." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {loans.map(({ loan, paidCents, remainingCents, payments }) => (
            <section key={loan.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">{loan.name}</h2>
                  <p className="text-xs text-muted">
                    {loan.isLiability ? "Wir schulden" : "Verliehen an"} {loan.counterparty || "–"} · seit {formatDate(loan.startDate, "short")}
                    {loan.interestRate ? ` · ${loan.interestRate.toLocaleString("de-DE")} % Zins` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="num text-xl font-semibold">{formatEur(remainingCents)}</div>
                  <div className="text-xs text-muted">Restschuld</div>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-positive" style={{ width: `${Math.min(100, (paidCents / loan.principalCents) * 100)}%` }} />
              </div>
              <p className="num mt-1.5 text-xs text-muted">
                {formatEur(paidCents)} von {formatEur(loan.principalCents)} getilgt ({formatPercent(paidCents, loan.principalCents)})
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] text-accent">{payments.length} Zahlungen · bearbeiten</summary>
                <ul className="num mt-2 max-h-56 overflow-y-auto text-[13px]">
                  {payments.map((p) => (
                    <li key={p.id} className="flex justify-between border-b border-border py-1">
                      <span>{formatDate(p.bookingDate, "short")} · <span className="text-muted">{p.purpose || p.payee}</span></span>
                      <span>{formatEur(p.amountCents)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3"><LoanForm loan={loan} /></div>
              </details>
            </section>
          ))}
          {loans.length === 0 && <p className="card p-8 text-center text-sm text-muted">Noch keine Kredite erfasst.</p>}
        </div>
        <section className="card h-fit p-5">
          <h2 className="mb-3 font-semibold">Neuer Kredit</h2>
          <LoanForm />
        </section>
      </div>
    </>
  );
}
