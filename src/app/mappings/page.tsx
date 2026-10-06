import { PageHeader } from "@/components/layout/page-header";
import { Seg } from "@/components/ui/stat-card";
import { listCategories, listMappings, listRules } from "@/lib/queries";
import { getParam, type SearchParams } from "@/lib/period";
import { CategoriesTable, MappingsTable, RulesTable } from "../settings/tables";

const tabs = [
  { id: "mappings", label: "Empfänger" },
  { id: "categories", label: "Kategorien" },
  { id: "rules", label: "Regeln" },
];

export default async function MappingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = getParam(sp, "tab") ?? "mappings";
  return (
    <>
      <PageHeader title="Zuordnungen" subtitle="Empfänger, Kategorien und Regeln pflegen. Änderungen wirken sofort auf alle nicht manuell bearbeiteten Umsätze." />
      <div className="mb-4"><Seg options={tabs} value={tab} hrefFor={(id) => `/mappings?tab=${id}`} /></div>
      {tab === "mappings" && <MappingsTable rows={listMappings()} />}
      {tab === "categories" && <CategoriesTable rows={listCategories()} />}
      {tab === "rules" && <RulesTable rows={listRules()} categories={listCategories().map((c) => c.name)} />}
    </>
  );
}
