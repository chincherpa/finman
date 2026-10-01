import { PageHeader } from "@/components/layout/page-header";
import { Seg } from "@/components/ui/stat-card";
import { listCategories, listMappings, listRules } from "@/lib/queries";
import { getParam, type SearchParams } from "@/lib/period";
import { CategoriesTable, DataPanel, MappingsTable, RulesTable } from "./tables";

const tabs = [
  { id: "mappings", label: "Empfänger-Zuordnung" },
  { id: "categories", label: "Kategorien (Werte)" },
  { id: "rules", label: "Regeln" },
  { id: "data", label: "Daten" },
];

export default async function SettingsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const tab = getParam(sp, "tab") ?? "mappings";
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Zuordnungstabellen pflegen. Änderungen wirken sofort auf alle nicht manuell bearbeiteten Umsätze." />
      <div className="mb-4"><Seg options={tabs} value={tab} hrefFor={(id) => `/settings?tab=${id}`} /></div>
      {tab === "mappings" && <MappingsTable rows={listMappings()} />}
      {tab === "categories" && <CategoriesTable rows={listCategories()} />}
      {tab === "rules" && <RulesTable rows={listRules()} categories={listCategories().map((c) => c.name)} />}
      {tab === "data" && <DataPanel />}
    </>
  );
}
