import { PageHeader } from "@/components/layout/page-header";
import { TransactionsView } from "@/components/transactions/transactions-view";
import { ImportButton } from "@/components/transactions/import-button";
import { listAccounts, listCategories, listPayees, listTransactions, type TxTab } from "@/lib/queries";
import { getParam, getParams, periodFromParams, type SearchParams } from "@/lib/period";

const TABS: TxTab[] = ["all", "review", "uncategorized", "hidden"];

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const period = periodFromParams(sp);
  const tabParam = getParam(sp, "tab") as TxTab;
  const tab: TxTab = TABS.includes(tabParam) ? tabParam : "all";
  const typeParam = getParam(sp, "type");
  const accountId = Number(getParam(sp, "account")) || undefined;
  const result = listTransactions({
    from: period.from,
    to: period.to,
    q: getParam(sp, "q"),
    tab,
    type: typeParam === "in" || typeParam === "out" ? typeParam : undefined,
    accountId,
    kat0: getParam(sp, "kat0"),
    kat1: getParam(sp, "kat1"),
    category: getParam(sp, "category"),
    payee: getParams(sp, "payee"),
    excludePayee: getParams(sp, "excludePayee"),
    month: getParam(sp, "month"),
  });
  const categories = listCategories();

  return (
    <>
      <PageHeader title="Umsätze" subtitle="Importierte Kontoumsätze" period={period} actions={<ImportButton />} />
      <TransactionsView
        result={result}
        tab={tab}
        categories={categories}
        payees={listPayees()}
        accounts={listAccounts()}
        groups={[...new Set(categories.map((c) => c.kat0).filter(Boolean))].sort()}
      />
    </>
  );
}
