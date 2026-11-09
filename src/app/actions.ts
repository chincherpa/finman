"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  accounts, balanceSnapshots, categories, loans, payeeMappings, rules, splits, transactions,
  type AccountType, type Rule,
} from "@/db/schema";
import { normalizeKey, parseAmountInput } from "@/lib/format";
import { importBankCsv, reResolve, type ImportSummary } from "@/lib/import/importer";
import { importCategories, importMappings, type LookupImportResult } from "@/lib/import/lookups";
import { payeeHistory as queryPayeeHistory } from "@/lib/queries";

function refresh() {
  revalidatePath("/", "layout");
}

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

const cents = parseAmountInput;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function requireDate(value: string, label: string): string {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label}: Ungültiges Datum.`);
  return value;
}

function validateRuleInput(r: { value?: string | null; op?: string | null; value2?: string | null; op2?: string | null }) {
  if (!r.value?.trim()) throw new Error("Bedingung fehlt.");
  if (r.op === "regex") new RegExp(r.value);
  if (r.value2?.trim() && r.op2 === "regex") new RegExp(r.value2);
}

// ---------------------------------------------------------------- import

export async function previewImportFiles(formData: FormData): Promise<ActionResult<Array<{ file: string; summary?: ImportSummary; error?: string }>>> {
  const results = [];
  for (const f of formData.getAll("files")) {
    if (!(f instanceof File)) continue;
    try {
      const summary = importBankCsv(db, f.name, Buffer.from(await f.arrayBuffer()), { dryRun: true });
      results.push({ file: f.name, summary });
    } catch (e) {
      results.push({ file: f.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok: true, data: results };
}

export async function importFiles(formData: FormData): Promise<ActionResult<Array<{ file: string; summary?: ImportSummary; error?: string }>>> {
  const results = [];
  for (const f of formData.getAll("files")) {
    if (!(f instanceof File)) continue;
    try {
      const summary = importBankCsv(db, f.name, Buffer.from(await f.arrayBuffer()));
      results.push({ file: f.name, summary });
    } catch (e) {
      results.push({ file: f.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  refresh();
  return { ok: true, data: results };
}

export async function importLookupFile(kind: "mappings" | "categories", formData: FormData): Promise<ActionResult<LookupImportResult>> {
  try {
    const f = formData.get("file");
    if (!(f instanceof File)) throw new Error("Keine Datei gewählt.");
    const buf = Buffer.from(await f.arrayBuffer());
    const data = kind === "mappings" ? importMappings(db, buf) : importCategories(db, buf);
    reResolve(db);
    refresh();
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function reResolveAll(): Promise<ActionResult<number>> {
  const n = reResolve(db);
  refresh();
  return { ok: true, data: n };
}

// ---------------------------------------------------------------- transactions

export interface TxUpdate {
  id: number;
  payee: string | null;
  category: string | null;
  comment: string;
  hidden: boolean;
  isTransfer: boolean;
  /** Save "raw name → payee" to mapping table. */
  saveMapping?: boolean;
  /** Create a rule from this decision. */
  rule?: { field: Rule["field"]; op: Rule["op"]; value: string; setCategory: boolean } | null;
}

export async function updateTransaction(u: TxUpdate): Promise<ActionResult<{ reResolved: number }>> {
  try {
    const t = db.select().from(transactions).where(eq(transactions.id, u.id)).get();
    if (!t) throw new Error("Umsatz nicht gefunden.");
    const payee = u.payee?.trim() || null;
    const category = u.category?.trim() || null;
    if (u.rule?.value.trim()) validateRuleInput({ value: u.rule.value, op: u.rule.op });
    const hasSplits = db.select().from(splits).where(eq(splits.transactionId, u.id)).all().length > 0;
    db.transaction((tx) => {
      tx.update(transactions).set({
        payee, category, comment: u.comment, hidden: u.hidden, isTransfer: u.isTransfer,
        needsReview: !(u.isTransfer || u.hidden || hasSplits || (payee && category)),
        resolvedBy: "manual",
      }).where(eq(transactions.id, u.id)).run();

      if (u.saveMapping && payee && t.rawName) {
        const rawKey = normalizeKey(t.rawName);
        tx.insert(payeeMappings).values({ rawName: t.rawName, rawKey, payee, defaultComment: u.comment })
          .onConflictDoUpdate({ target: payeeMappings.rawKey, set: { payee, defaultComment: u.comment } }).run();
      }
      if (u.rule?.value.trim()) {
        tx.insert(rules).values({
          name: `${payee ?? ""} ${category ? `→ ${category}` : ""}`.trim(),
          priority: 50, field: u.rule.field, op: u.rule.op, value: u.rule.value.trim(),
          setPayee: payee, setCategory: u.rule.setCategory ? category : null,
          setComment: u.comment || null, setTransfer: u.isTransfer || null,
        }).run();
      }
    });
    const reResolved = u.saveMapping || u.rule ? reResolve(db, { onlyNeedsReview: true }) : 0;
    refresh();
    return { ok: true, data: { reResolved } };
  } catch (e) {
    return fail(e);
  }
}

export async function bulkUpdate(ids: number[], patch: { category?: string | null; payee?: string; hidden?: boolean; reviewed?: boolean; isTransfer?: boolean }): Promise<ActionResult> {
  try {
    if (!ids.length) return { ok: true };
    const set: Partial<typeof transactions.$inferInsert> = { resolvedBy: "manual" };
    if (patch.category !== undefined) set.category = patch.category;
    if (patch.payee !== undefined) set.payee = patch.payee;
    if (patch.hidden !== undefined) set.hidden = patch.hidden;
    if (patch.isTransfer !== undefined) set.isTransfer = patch.isTransfer;
    if (patch.reviewed || patch.category || patch.isTransfer || patch.hidden) set.needsReview = false;
    db.update(transactions).set(set).where(inArray(transactions.id, ids)).run();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function getPayeeHistory(payee: string): Promise<ActionResult<{ months: Array<{ month: string; cents: number; count: number }>; total: number }>> {
  try {
    return { ok: true, data: queryPayeeHistory(payee) };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTransaction(id: number): Promise<ActionResult> {
  try {
    const t = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (t?.status !== "pending") return { ok: false, error: "Nur vorgemerkte Umsätze können gelöscht werden." };
    db.delete(transactions).where(eq(transactions.id, id)).run();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- lookups CRUD

export async function saveMapping(m: { id?: number; rawName: string; payee: string; defaultComment: string }): Promise<ActionResult> {
  try {
    const values = { rawName: m.rawName.trim(), rawKey: normalizeKey(m.rawName), payee: m.payee.trim(), defaultComment: m.defaultComment.trim() };
    if (!values.rawName || !values.payee) throw new Error("Original und Empfänger sind Pflicht.");
    if (m.id) db.update(payeeMappings).set(values).where(eq(payeeMappings.id, m.id)).run();
    else db.insert(payeeMappings).values(values).run();
    reResolve(db);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMapping(id: number): Promise<ActionResult> {
  try {
    db.delete(payeeMappings).where(eq(payeeMappings.id, id)).run();
    reResolve(db);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveCategory(c: { id?: number; name: string; kat0: string; kat1: string; kat2: string; fixed: boolean }): Promise<ActionResult> {
  try {
    const values = { name: c.name.trim(), nameKey: normalizeKey(c.name), kat0: c.kat0.trim(), kat1: c.kat1.trim(), kat2: c.kat2.trim(), fixed: c.fixed };
    if (!values.name || !values.kat0) throw new Error("Name und Kategorie 0 sind Pflicht.");
    db.transaction((tx) => {
      if (c.id) {
        const old = tx.select().from(categories).where(eq(categories.id, c.id)).get();
        tx.update(categories).set(values).where(eq(categories.id, c.id)).run();
        if (old && old.name !== values.name) {
          tx.update(transactions).set({ category: values.name }).where(eq(transactions.category, old.name)).run();
          tx.update(splits).set({ category: values.name }).where(eq(splits.category, old.name)).run();
          tx.update(rules).set({ setCategory: values.name }).where(eq(rules.setCategory, old.name)).run();
        }
      } else tx.insert(categories).values(values).run();
    });
    reResolve(db, { onlyNeedsReview: true });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCategory(id: number): Promise<ActionResult> {
  try {
    db.transaction((tx) => {
      const old = tx.select().from(categories).where(eq(categories.id, id)).get();
      if (!old) return;
      tx.delete(categories).where(eq(categories.id, id)).run();
      // Rows that still point at the removed name go back into the review queue (manual ones too:
      // their category no longer exists).
      tx.update(transactions).set({ category: null, needsReview: true }).where(eq(transactions.category, old.name)).run();
      tx.update(splits).set({ category: null }).where(eq(splits.category, old.name)).run();
      tx.update(rules).set({ setCategory: null }).where(eq(rules.setCategory, old.name)).run();
    });
    reResolve(db);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type RuleInput = Omit<typeof rules.$inferInsert, "id"> & { id?: number };

export async function saveRule(r: RuleInput): Promise<ActionResult<number>> {
  try {
    validateRuleInput(r);
    const { id, ...values } = r;
    if (id) db.update(rules).set(values).where(eq(rules.id, id)).run();
    else db.insert(rules).values(values).run();
    const n = reResolve(db);
    refresh();
    return { ok: true, data: n };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRule(id: number): Promise<ActionResult> {
  try {
    db.delete(rules).where(eq(rules.id, id)).run();
    reResolve(db);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- accounts, balances, loans

export async function saveAccount(a: { id?: number; name: string; type: AccountType; accountNumber?: string; includeInNetWorth: boolean }): Promise<ActionResult> {
  try {
    if (!a.name.trim()) throw new Error("Name fehlt.");
    const values = { name: a.name.trim(), type: a.type, accountNumber: a.accountNumber?.trim() || null, includeInNetWorth: a.includeInNetWorth };
    if (a.id) db.update(accounts).set(values).where(eq(accounts.id, a.id)).run();
    else db.insert(accounts).values(values).run();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addSnapshot(s: { accountId: number; date: string; balance: string }): Promise<ActionResult> {
  try {
    const date = requireDate(s.date, "Stichtag");
    const balanceCents = cents(s.balance);
    db.insert(balanceSnapshots).values({ accountId: s.accountId, date, balanceCents, source: "manual" })
      .onConflictDoUpdate({ target: [balanceSnapshots.accountId, balanceSnapshots.date, balanceSnapshots.source], set: { balanceCents } })
      .run();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveLoan(l: { id?: number; name: string; counterparty: string; principal: string; interestRate: string; startDate: string; matchText: string; isLiability: boolean }): Promise<ActionResult> {
  try {
    if (!l.name.trim() || !l.matchText.trim()) throw new Error("Name und Suchtext sind Pflicht.");
    const values = {
      name: l.name.trim(), counterparty: l.counterparty.trim(), principalCents: Math.abs(cents(l.principal)),
      interestRate: Number(l.interestRate.replace(",", ".")) || 0, startDate: requireDate(l.startDate, "Beginn"), matchText: l.matchText.trim(), isLiability: l.isLiability,
    };
    if (l.id) db.update(loans).set(values).where(eq(loans.id, l.id)).run();
    else db.insert(loans).values(values).run();
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLoan(id: number): Promise<ActionResult> {
  db.delete(loans).where(eq(loans.id, id)).run();
  refresh();
  return { ok: true };
}
