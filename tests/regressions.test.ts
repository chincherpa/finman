// Runs on a fresh clone: uses only synthetic data.
// DATABASE_FILE=:memory: and TZ=Europe/Berlin come from vitest.config.mts
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { accounts, balanceSnapshots, categories, transactions } from "@/db/schema";
import { parseGermanDate, parseAmountInput, normalizeKey } from "@/lib/format";
import { importBankCsv } from "@/lib/import/importer";
import { parseBankCsv } from "@/lib/import/parse";
import { shiftPeriod, periodFromParams, withParams } from "@/lib/period";
import { getLines, listTransactions, sumBy, accountBalances } from "@/lib/queries";

const HEADER =
  "Kontonummer;Datum/Zeit;Buchungstag;Wertstellung;Soll/Haben;Buchungsschlüssel;Buchungsart;Empfänger/Auftraggeber Name;Empfänger/Auftraggeber IBAN;Empfänger/Auftraggeber BIC;Glaeubiger-ID;Mandatsreferenz;Mandatsdatum;Vwz.0;Vwz.1;End-to-End-Identifikation";

function csv(...rows: Array<{ date: string; time?: string; amount: string; name: string; purpose?: string }>): string {
  return [HEADER, ...rows.map((r) =>
    `1;${r.date} ${r.time ?? "10:00"};${r.date};${r.date};${r.amount};;Lastschrift;${r.name};;;;;;${r.purpose ?? ""};;`)].join("\n") + "\n";
}

const account = db.insert(accounts).values({ name: "Test", type: "checking" }).returning().get();
function tx(over: Partial<typeof transactions.$inferInsert>) {
  return db.insert(transactions).values({
    accountId: account.id, bookedAt: "2026-01-10T10:00", bookingDate: "2026-01-10", amountCents: -1000, bookingType: "",
    rawName: "", iban: "", bic: "", creditorId: "", mandateRef: "", purpose: "", e2eId: "", status: "booked",
    hash: Math.random().toString(36), ...over,
  }).returning().get();
}

describe("refunds", () => {
  it("net against the base category instead of counting as income", () => {
    db.insert(categories).values([
      { name: "Amazon Flora", nameKey: normalizeKey("Amazon Flora"), kat0: "Shopping", kat1: "Online", kat2: "", fixed: false },
      { name: "Amazon Flora Erstattung", nameKey: normalizeKey("Amazon Flora Erstattung"), kat0: "Erstattung", kat1: "Amazon Flora Erstattung", kat2: "", fixed: false },
    ]).run();
    tx({ amountCents: -5000, category: "Amazon Flora", payee: "Amazon" });
    tx({ amountCents: -1000, category: "Amazon Flora", payee: "Amazon" });
    tx({ amountCents: 2000, category: "Amazon Flora Erstattung", payee: "Amazon" });
    const lines = getLines({ from: "2026-01-01", to: "2026-01-31" });
    expect(lines.filter((l) => l.kind === "income")).toHaveLength(0);
    const groups = sumBy(lines.filter((l) => l.kind === "expense"), (l) => l.kat0);
    expect(groups).toEqual([expect.objectContaining({ key: "Shopping", cents: 4000 })]);
  });
});

describe("Endsaldo marker", () => {
  it("does not duplicate the booking when it later loses the marker", () => {
    const marked = csv({ date: "05.02.2026", amount: "-10,00", name: "Shop", purpose: "Einkauf **Endsaldo** 100,00H" });
    importBankCsv(db, "a.csv", marked);
    const later = csv(
      { date: "05.02.2026", amount: "-10,00", name: "Shop", purpose: "Einkauf" },
      { date: "06.02.2026", amount: "-5,00", name: "Other", purpose: "x" },
    );
    const s = importBankCsv(db, "b.csv", later);
    expect(s.inserted).toBe(1);
    expect(s.duplicates).toBe(1);
    expect(db.select().from(balanceSnapshots).all().length).toBeGreaterThan(0);
  });

  it("keeps the later closing balance of the same day", () => {
    const first = csv({ date: "20.02.2026", amount: "0,00", name: "Saldo", purpose: "**Endsaldo** 100,00H" });
    const second = csv({ date: "20.02.2026", time: "18:00", amount: "0,00", name: "Saldo", purpose: "**Endsaldo** 150,00H" });
    importBankCsv(db, "c.csv", first);
    importBankCsv(db, "d.csv", second);
    const snap = db.select().from(balanceSnapshots).all().find((s) => s.date === "2026-02-20")!;
    expect(snap.balanceCents).toBe(15000);
    expect(accountBalances({ from: "2026-02-01", to: "2026-02-28" })).toBeTruthy();
  });
});

describe("dates", () => {
  it("rejects rows with an unparseable booking date", () => {
    expect(() => parseBankCsv(csv({ date: "xx.yy.zz", amount: "-1,00", name: "A" }))).toThrow(/Zeile 2/);
  });
  it("accepts two-digit years and rejects impossible dates", () => {
    expect(parseGermanDate("05.02.26")).toBe("2026-02-05");
    expect(parseGermanDate("31.02.2026")).toBeNull();
  });
});

describe("shiftPeriod across DST (Europe/Berlin)", () => {
  it("moves forward by whole calendar days", () => {
    expect(shiftPeriod({ from: "2026-10-20", to: "2026-10-26", preset: "custom" }, 1)).toEqual({ from: "2026-10-27", to: "2026-11-02" });
  });
  it("moves back by whole calendar days", () => {
    expect(shiftPeriod({ from: "2026-03-30", to: "2026-04-05", preset: "custom" }, -1)).toEqual({ from: "2026-03-23", to: "2026-03-29" });
  });
});

describe("params", () => {
  it("falls back to last-12 for unknown presets and bad dates", () => {
    const p = periodFromParams({ p: "foo" });
    expect(p.preset).toBe("last-12");
    expect(p.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(periodFromParams({ from: "x", to: "y" }).preset).toBe("last-12");
  });
  it("keeps repeated params", () => {
    expect(withParams("/t", { payee: ["a", "b"] }, {})).toBe("/t?payee=a&payee=b");
  });
});

describe("amount input", () => {
  it("parses German and plain notation", () => {
    expect(parseAmountInput("12,5")).toBe(1250);
    expect(parseAmountInput("1.234")).toBe(123400);
    expect(parseAmountInput("1.234,50")).toBe(123450);
    expect(parseAmountInput("12.50")).toBe(1250);
    expect(() => parseAmountInput("abc")).toThrow();
  });
});

describe("transaction filters", () => {
  it("matches payees containing a comma and escapes LIKE wildcards", () => {
    tx({ payee: "Hokema, Maria", bookingDate: "2026-03-01", bookedAt: "2026-03-01T10:00", purpose: "100% sicher" });
    tx({ payee: "Other", bookingDate: "2026-03-02", bookedAt: "2026-03-02T10:00", purpose: "1000 sicher" });
    const range = { from: "2026-03-01", to: "2026-03-31" };
    expect(listTransactions({ ...range, payee: ["Hokema, Maria"] }).total).toBe(1);
    expect(listTransactions({ ...range, excludePayee: ["Hokema, Maria"] }).total).toBe(1);
    expect(listTransactions({ ...range, q: "100%" }).total).toBe(1);
  });
});
