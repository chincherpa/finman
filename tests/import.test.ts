import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDb, type DB } from "@/db/client";
import { balanceSnapshots, rules, transactions } from "@/db/schema";
import { parseGermanAmount } from "@/lib/format";
import { joinPurpose, parseBankCsv } from "@/lib/import/parse";
import { fuzzyKey } from "@/lib/import/resolve";
import { importCategories, importMappings } from "@/lib/import/lookups";
import { importBankCsv, reResolve } from "@/lib/import/importer";

const docs = path.join(process.cwd(), "documents");
const sampleFile = fs.readdirSync(docs).find((f) => f.startsWith("umsaetze-"))!;
const sample = fs.readFileSync(path.join(docs, sampleFile));

const HEADER =
  "Kontonummer;Datum/Zeit;Buchungstag;Wertstellung;Soll/Haben;Buchungsschlüssel;Buchungsart;Empfänger/Auftraggeber Name;Empfänger/Auftraggeber IBAN;Empfänger/Auftraggeber BIC;Glaeubiger-ID;Mandatsreferenz;Mandatsdatum;Vwz.0;Vwz.1;End-to-End-Identifikation";

function seeded(): DB {
  const db = openDb(":memory:");
  importMappings(db, fs.readFileSync(path.join(docs, "mapping.csv")));
  importCategories(db, fs.readFileSync(path.join(docs, "werte.csv")));
  return db;
}

describe("parsing", () => {
  it("parses german amounts", () => {
    expect(parseGermanAmount("-1.000,00")).toBe(-100000);
    expect(parseGermanAmount("18,01")).toBe(1801);
  });

  it("joins purpose chunks and stops at SVWZ+", () => {
    expect(joinPurpose(["1047/PP. CrowdFar", "ming - La Ruche", "SVWZ+", "dup"])).toBe("1047/PP. CrowdFarming - La Ruche");
  });

  it("decodes Latin-1 sample and classifies rows", () => {
    const rows = parseBankCsv(sample);
    expect(rows).toHaveLength(166);
    expect(rows.filter((r) => r.kind === "pending")).toHaveLength(3);
    expect(rows.some((r) => r.bookingType === "Gutschrift Überw.")).toBe(true);
    const saldo = rows.find((r) => r.balanceCents != null)!;
    expect(saldo.balanceCents).toBe(498909);
    expect(new Set(rows.map((r) => r.hash)).size).toBe(rows.length);
  });

  it("builds fuzzy keys", () => {
    expect(fuzzyKey("BAECKEREI U KONDITOREI TREI 28 GIR 79982677//STUTTGART/DE")).toBe("baeckerei u konditorei trei");
    expect(fuzzyKey("REWE SAGT DANKE. 45400302//stuttgart/de")).toBe("rewe sagt danke");
  });
});

describe("import", () => {
  let db: DB;
  beforeEach(() => {
    db = seeded();
  });

  it("imports sample, resolves known payees and dedupes on re-import", () => {
    const s1 = importBankCsv(db, sampleFile, sample);
    expect(s1.inserted).toBeGreaterThan(150);
    expect(s1.pending).toBe(3);
    expect(db.select().from(balanceSnapshots).all()).toHaveLength(1);

    const edeka = db.select().from(transactions).where(eq(transactions.rawName, "EDEKA WECKERT//STUTTGART/DE")).all();
    expect(edeka.length).toBeGreaterThan(0);
    expect(edeka[0].payee).toBe("Edeka");
    expect(edeka[0].category).toBe("Edeka");

    const s2 = importBankCsv(db, sampleFile, sample);
    expect(s2.inserted).toBe(0);
    expect(s2.duplicates).toBe(s1.inserted);
  });

  it("replaces pending card payment by booked one", () => {
    const pending = `${HEADER}\n1;05.01.2026 14:44;05.01.2026;;-14,65;;Kartenzahlung/-en;Kartenzahlung/-en;;;;;;EC 79982677 050126144447 04;;\n`;
    expect(importBankCsv(db, "a.csv", pending).pending).toBe(1);
    const booked = `${HEADER}\n1;07.01.2026 09:36;07.01.2026;07.01.2026;-14,65;20080;Debitkartenzahlung;BAECKEREI U KONDITOREI TREI 28 GIR 79982677//STUTTGART/DE;DE1;BIC;;;;2026-01-05T14:44 Debit;;E2E\n`;
    const s = importBankCsv(db, "b.csv", booked);
    expect(s.replacedPending).toBe(1);
    const all = db.select().from(transactions).all();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("booked");
    expect(all[0].payee).toBe("Bäckerei");
  });

  it("applies rules and flags unknown payees", () => {
    db.insert(rules).values({ field: "purpose", op: "contains", value: "Spotify", field2: "payee", op2: "equals", value2: "Paypal", setPayee: "Paypal", setCategory: "Paypal Freizeit" }).run();
    importBankCsv(db, sampleFile, sample);
    const spotify = db.select().from(transactions).all().find((t) => t.purpose.includes("Spotify"))!;
    expect(spotify.category).toBe("Paypal Freizeit");
    expect(spotify.needsReview).toBe(false);
    const otherPaypal = db.select().from(transactions).all().find((t) => t.payee === "Paypal" && !t.purpose.includes("Spotify"))!;
    expect(otherPaypal.needsReview).toBe(true);

    const unknown = db.select().from(transactions).where(eq(transactions.rawName, "Andreas Johann Pospiech")).get()!;
    expect(unknown.needsReview).toBe(true);
    expect(unknown.payee).toBeNull();
  });

  it("re-resolve leaves manual edits alone", () => {
    importBankCsv(db, sampleFile, sample);
    const t = db.select().from(transactions).where(eq(transactions.rawName, "EDEKA WECKERT//STUTTGART/DE")).get()!;
    db.update(transactions).set({ payee: "Foo", category: null, resolvedBy: "manual" }).where(eq(transactions.id, t.id)).run();
    reResolve(db);
    expect(db.select().from(transactions).where(eq(transactions.id, t.id)).get()!.payee).toBe("Foo");
  });
});
