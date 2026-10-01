import { PageHeader } from "@/components/layout/page-header";
import { accountBalances, listImports } from "@/lib/queries";
import { formatDate, formatEur } from "@/lib/format";
import { presetRange } from "@/lib/period";
import { AccountForm, SnapshotForm } from "./forms";

export default function AccountsPage() {
  const balances = accountBalances(presetRange("month"));
  const importsList = listImports();
  return (
    <>
      <PageHeader title="Konten" subtitle="Girokonten entstehen automatisch beim Import. Depots, Bargeld oder Sachwerte hier anlegen und Stände erfassen." />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-4">
          {balances.map((b) => (
            <section key={b.account.id} id={`a${b.account.id}`} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{b.account.name}</h2>
                  <p className="text-xs text-muted">
                    {b.account.accountNumber ?? "ohne Kontonummer"} · {b.account.type}
                    {b.lastSnapshot && ` · letzter Kontostand ${formatDate(b.lastSnapshot, "short")}`}
                    {!b.account.includeInNetWorth && " · nicht im Vermögen"}
                  </p>
                </div>
                <div className="num text-xl font-semibold">{b.balanceCents == null ? "–" : formatEur(b.balanceCents)}</div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <AccountForm account={b.account} />
                <SnapshotForm accountId={b.account.id} />
              </div>
            </section>
          ))}
          {balances.length === 0 && <p className="card p-8 text-center text-sm text-muted">Noch keine Konten.</p>}
        </div>
        <div className="flex flex-col gap-5">
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Neues Konto</h2>
            <AccountForm />
          </section>
          <section className="card p-5">
            <h2 className="mb-3 font-semibold">Importe</h2>
            <ul className="flex flex-col gap-2 text-[13px]">
              {importsList.map(({ i, accountName }) => (
                <li key={i.id} className="border-b border-border pb-2 last:border-0">
                  <div className="truncate font-medium">{i.filename}</div>
                  <div className="num text-xs text-muted">
                    {new Date(`${i.importedAt}Z`).toLocaleString("de-DE")} · {accountName} · {i.rowsNew} neu · {i.rowsDuplicate} doppelt
                  </div>
                </li>
              ))}
              {importsList.length === 0 && <li className="text-muted">Noch nichts importiert.</li>}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
