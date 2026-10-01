/**
 * Seed lookup tables from documents/mapping.csv + documents/werte.csv and add starter rules.
 * Optionally imports bank CSVs passed as arguments:  npm run seed -- documents/umsaetze-*.csv
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/db/client";
import { rules } from "../src/db/schema";
import { importCategories, importMappings } from "../src/lib/import/lookups";
import { importBankCsv, reResolve } from "../src/lib/import/importer";

const root = process.cwd();
const db = openDb(process.env.DATABASE_FILE ?? path.join(root, "data", "finance.db"));

const m = importMappings(db, fs.readFileSync(path.join(root, "documents", "mapping.csv")));
console.log(`mapping.csv: ${m.inserted} neu, ${m.updated} aktualisiert`, m.duplicatesInFile.length ? `(doppelt: ${m.duplicatesInFile.join(", ")})` : "");
const c = importCategories(db, fs.readFileSync(path.join(root, "documents", "werte.csv")));
console.log(`werte.csv:   ${c.inserted} neu, ${c.updated} aktualisiert`, c.duplicatesInFile.length ? `(doppelt: ${c.duplicatesInFile.join(", ")})` : "");

if (db.select().from(rules).all().length === 0) {
  db.insert(rules).values([
    { name: "Geldautomat", priority: 10, field: "booking_type", op: "regex", value: "^GAA|Barausz", setPayee: "Abheben" },
    { name: "Amazon Prime", priority: 20, field: "purpose", op: "contains", value: "Prime", field2: "raw_name", op2: "contains", value2: "amazon", setPayee: "Amazon", setCategory: "Amazon Prime" },
    { name: "Amazon Digital", priority: 30, field: "raw_name", op: "contains", value: "AMAZON DIGITAL", setPayee: "Amazon", setCategory: "AMAZON DIGITAL" },
    { name: "Tilgung Kredit Maria", priority: 40, field: "purpose", op: "contains", value: "Tilgung", field2: "raw_name", op2: "contains", value2: "Hokema, Maria", setPayee: "Hokema, Maria", setCategory: "Hokema, Maria Kredit" },
  ]).run();
  console.log("Start-Regeln angelegt.");
}

for (const file of process.argv.slice(2)) {
  const s = importBankCsv(db, path.basename(file), fs.readFileSync(file));
  console.log(`${path.basename(file)}:`, s);
}
console.log(`Neu aufgelöst: ${reResolve(db)}`);
