/**
 * Replace all transactions with the full history from tranaktionen.csv
 * (old manual export: Datum;Betrag;Empfaenger;Vwz;Bemerkung;;;).
 * Usage: npm run import:legacy -- tranaktionen.csv
 */
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { openDb } from "../src/db/client";
import { accounts, imports, transactions } from "../src/db/schema";
import { parseGermanDate, parseGermanDateTime } from "../src/lib/format";
import { extractTerminalId, decodeBankFile, rowHash } from "../src/lib/import/parse";
import { loadResolveContext } from "../src/lib/import/importer";
import { resolve } from "../src/lib/import/resolve";

const root = process.cwd();
const db = openDb(process.env.DATABASE_FILE ?? path.join(root, "data", "finance.db"));
const file = process.argv[2] ?? "tranaktionen.csv";

function parseAmount(value: string): number {
  const s = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  if (s === "" || s === "-") return 0;
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Invalid amount: "${value}"`);
  return Math.round(n * 100);
}

const account = db.select().from(accounts).get();
if (!account) throw new Error("Kein Konto vorhanden – erst ein Konto anlegen.");

const text = decodeBankFile(fs.readFileSync(path.join(root, file)));
const { data } = Papa.parse<Record<string, string>>(text, { header: true, delimiter: ";", skipEmptyLines: true });

const seen = new Map<string, number>();
const rows = data.map((row) => {
  const datum = (row["Datum"] ?? "").trim();
  const bookingDate = parseGermanDate(datum) ?? "";
  const bookedAt = parseGermanDateTime(datum) ?? `${bookingDate}T00:00`;
  const amountCents = parseAmount(row["Betrag"] ?? "");
  const rawName = (row["Empfaenger"] ?? "").trim();
  const bemerkung = (row["Bemerkung"] ?? "").trim();
  const purpose = [row["Vwz"], bemerkung].map((s) => (s ?? "").trim()).filter(Boolean).join(" ");
  const terminalId = extractTerminalId(rawName, purpose);
  const base = rowHash({ accountNumber: account.accountNumber ?? "", bookedAt, amountCents, rawName, purpose, e2eId: "" });
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return {
    bookedAt, bookingDate, amountCents, rawName, purpose, bemerkung, terminalId,
    hash: n === 0 ? base : `${base}-${n}`,
  };
}).filter((r) => r.bookingDate);

db.transaction((tx) => {
  tx.delete(transactions).run();
  tx.delete(imports).run();

  const importId = tx.insert(imports).values({ filename: path.basename(file), accountId: account.id }).returning({ id: imports.id }).get().id;
  const ctx = loadResolveContext(db);

  for (const row of rows) {
    const r = resolve({ rawName: row.rawName, purpose: row.purpose, iban: "", amountCents: row.amountCents, terminalId: row.terminalId, bookingType: "" }, ctx);
    tx.insert(transactions).values({
      accountId: account.id,
      importId,
      bookedAt: row.bookedAt,
      bookingDate: row.bookingDate,
      valueDate: null,
      amountCents: row.amountCents,
      bookingType: "",
      rawName: row.rawName,
      iban: "",
      bic: "",
      creditorId: "",
      mandateRef: "",
      purpose: row.purpose,
      e2eId: "",
      terminalId: row.terminalId,
      status: "booked",
      hash: row.hash,
      payee: r.payee,
      category: r.category,
      comment: row.bemerkung,
      needsReview: r.needsReview,
      isTransfer: r.isTransfer,
      resolvedBy: r.resolvedBy,
    }).run();
  }

  tx.update(imports).set({ rowsNew: rows.length }).where(eq(imports.id, importId)).run();
  console.log(`${path.basename(file)}: ${rows.length} Buchungen importiert.`);
});
