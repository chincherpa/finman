import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { accounts, balanceSnapshots, categories, imports, payeeMappings, rules, transactions } from "@/db/schema";
import { parseBankCsv, type ParsedRow } from "./parse";
import { buildContext, resolve, type ResolveContext } from "./resolve";

export interface ImportPreviewRow {
  bookingDate: string;
  amountCents: number;
  payee: string | null;
  rawName: string;
  purpose: string;
  category: string | null;
  needsReview: boolean;
}

export interface ImportSummary {
  importId: number;
  accountId: number;
  rowsRead: number;
  inserted: number;
  duplicates: number;
  balanceSnapshots: number;
  needsReview: number;
  rows: ImportPreviewRow[];
}

/** Thrown to unwind a dry-run import transaction; carries the summary that would have been returned. */
class DryRunRollback extends Error {
  constructor(public summary: ImportSummary) {
    super("dry-run");
  }
}

export function loadResolveContext(db: DB): ResolveContext {
  const terminals = db
    .selectDistinct({ terminalId: transactions.terminalId, payee: transactions.payee })
    .from(transactions)
    .where(and(isNotNull(transactions.terminalId), isNotNull(transactions.payee), eq(transactions.needsReview, false)))
    .all() as Array<{ terminalId: string; payee: string }>;
  return buildContext(
    db.select().from(payeeMappings).all(),
    db.select().from(categories).all(),
    db.select().from(rules).all(),
    terminals,
  );
}

function ensureAccount(db: DB, accountNumber: string): number {
  const existing = db.select().from(accounts).where(eq(accounts.accountNumber, accountNumber)).get();
  if (existing) return existing.id;
  return db
    .insert(accounts)
    .values({ name: `Girokonto ${accountNumber}`, accountNumber, type: "checking" })
    .returning({ id: accounts.id })
    .get().id;
}

function toValues(row: ParsedRow, accountId: number, importId: number, ctx: ResolveContext) {
  const r = resolve(row, ctx);
  return {
    accountId,
    importId,
    bookedAt: row.bookedAt,
    bookingDate: row.bookingDate,
    valueDate: row.valueDate,
    amountCents: row.amountCents,
    bookingType: row.bookingType,
    rawName: row.rawName,
    iban: row.iban,
    bic: row.bic,
    creditorId: row.creditorId,
    mandateRef: row.mandateRef,
    purpose: row.purpose,
    e2eId: row.e2eId,
    terminalId: row.terminalId,
    status: "booked" as const,
    hash: row.hash,
    payee: r.payee,
    category: r.category,
    comment: r.comment,
    needsReview: r.needsReview,
    isTransfer: r.isTransfer,
    resolvedBy: r.resolvedBy,
  };
}

export function importBankCsv(db: DB, filename: string, input: Buffer | string, opts: { dryRun?: boolean } = {}): ImportSummary {
  const rows = parseBankCsv(input);
  if (rows.length === 0) throw new Error("Datei enthält keine Umsätze.");
  const accountNumber = rows[0].accountNumber;
  if (!accountNumber) throw new Error("Spalte 'Kontonummer' fehlt – ist das ein Umsatz-Export?");
  if (rows.some((r) => r.accountNumber !== accountNumber)) {
    throw new Error("Datei enthält Umsätze mehrerer Konten – bitte pro Konto exportieren.");
  }

  try {
    return db.transaction((tx) => {
      const d = tx as unknown as DB;
      const accountId = ensureAccount(d, accountNumber);
      const ctx = loadResolveContext(d);
      const importId = tx.insert(imports).values({ filename, accountId }).returning({ id: imports.id }).get().id;

      const s: ImportSummary = {
        importId, accountId, rowsRead: rows.length, inserted: 0, duplicates: 0,
        balanceSnapshots: 0, needsReview: 0, rows: [],
      };

      // SQLite limits bind parameters per statement – look up hashes in chunks.
      const existing = new Set<string>();
      const hashes = rows.map((r) => r.hash);
      for (let k = 0; k < hashes.length; k += 500) {
        for (const r of tx.select({ hash: transactions.hash }).from(transactions)
          .where(inArray(transactions.hash, hashes.slice(k, k + 500))).all()) existing.add(r.hash);
      }

      for (const row of rows) {
        if (row.kind === "balance" || row.kind === "skip") {
          if (row.balanceCents != null) {
            const res = tx.insert(balanceSnapshots)
              .values({ accountId, date: row.bookingDate, balanceCents: row.balanceCents, source: "endsaldo", asOf: row.bookedAt })
              .onConflictDoUpdate({
                target: [balanceSnapshots.accountId, balanceSnapshots.date, balanceSnapshots.source],
                set: { balanceCents: row.balanceCents, asOf: row.bookedAt },
              }).run();
            s.balanceSnapshots += res.changes;
          }
          if (row.kind === "skip") continue;
        }
        if (existing.has(row.hash)) {
          s.duplicates++;
          continue;
        }
        existing.add(row.hash);
        const values = toValues(row, accountId, importId, ctx);

        tx.insert(transactions).values(values).run();
        s.inserted++;
        s.rows.push({
          bookingDate: row.bookingDate, amountCents: row.amountCents, payee: values.payee,
          rawName: row.rawName, purpose: row.purpose, category: values.category, needsReview: values.needsReview,
        });
        if (values.needsReview) s.needsReview++;
      }

      tx.update(imports).set({ rowsNew: s.inserted, rowsDuplicate: s.duplicates })
        .where(eq(imports.id, importId)).run();
      if (opts.dryRun) throw new DryRunRollback(s);
      return s;
    });
  } catch (e) {
    if (e instanceof DryRunRollback) return e.summary;
    throw e;
  }
}

/**
 * Re-run mapping/rules/category resolution. Manually edited transactions are never touched.
 * Returns number of rows changed.
 */
export function reResolve(db: DB, opts: { onlyNeedsReview?: boolean } = {}): number {
  const ctx = loadResolveContext(db);
  const conds = [sql`coalesce(${transactions.resolvedBy}, '') != 'manual'`];
  if (opts.onlyNeedsReview) conds.push(eq(transactions.needsReview, true));
  const rows = db.select().from(transactions).where(and(...conds)).all();
  let changed = 0;
  db.transaction((tx) => {
    for (const t of rows) {
      const r = resolve(t, ctx);
      if (r.payee === t.payee && r.category === t.category && r.needsReview === t.needsReview &&
        r.isTransfer === t.isTransfer && (r.comment === t.comment || !r.comment)) continue;
      tx.update(transactions).set({
        payee: r.payee, category: r.category, needsReview: r.needsReview, isTransfer: r.isTransfer,
        resolvedBy: r.resolvedBy, comment: r.comment || t.comment,
      }).where(eq(transactions.id, t.id)).run();
      changed++;
    }
  });
  return changed;
}
