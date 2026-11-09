import { PageHeader } from "@/components/layout/page-header";
import { DataPanel } from "./tables";

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Einstellungen" subtitle="Daten und Sicherung. Empfänger, Kategorien und Regeln pflegst du unter „Zuordnungen“." />
      <DataPanel />
    </>
  );
}
