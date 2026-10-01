import { listCategories, listMappings } from "@/lib/queries";
import { toCsv } from "@/lib/import/lookups";

/** Export lookup tables in the original mapping.csv / werte.csv format. */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  let csv: string;
  let name: string;
  if (kind === "mappings") {
    csv = toCsv([["old", "new", "Comment"], ...listMappings().map((m) => [m.rawName, m.payee, m.defaultComment])]);
    name = "mapping.csv";
  } else if (kind === "categories") {
    csv = toCsv([
      ["Name", "Kategorie 0", "Kategorie 1", "Kategorie 2", "Fix"],
      ...listCategories().map((c) => [c.name, c.kat0, c.kat1, c.kat2, c.fixed ? "ja" : "nein"]),
    ]);
    name = "werte.csv";
  } else {
    return new Response("Not found", { status: 404 });
  }
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` },
  });
}
