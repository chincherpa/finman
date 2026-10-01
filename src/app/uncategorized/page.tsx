import { PageHeader } from "@/components/layout/page-header";
import { TransactionsView } from "@/components/transactions/transactions-view";
import { listAccounts, listCategories, listPayees, listTransactions } from "@/lib/queries";
import { getParam, type SearchParams } from "@/lib/period";

/** Review queue: everything flagged, regardless of period. */
export default async function UncategorizedPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const result = listTransactions({ from: "1900-01-01", to: "2999-12-31", tab: "review", q: getParam(sp, "q") });
  const categories = listCategories();
  return (
    <>
      <PageHeader
        title="Zu prüfen"
        subtitle="Umsätze ohne eindeutigen Empfänger oder Kategorie. Klicken, zuordnen, „Speichern & weiter“ (Enter)."
      />
      <TransactionsView
        result={result}
        tab="review"
        lockTab
        categories={categories}
        payees={listPayees()}
        accounts={listAccounts()}
        groups={[...new Set(categories.map((c) => c.kat0).filter(Boolean))].sort()}
      />
    </>
  );
}
