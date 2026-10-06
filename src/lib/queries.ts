import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  accounts, balanceSnapshots, categories, imports, loans, payeeMappings, rules, splits, transactions,
  type Account, type Category, type Loan, type Split, type Transaction,
} from "@/db/schema";
import { normalizeKey } from "@/lib/format";
import { iso, monthsInPeriod } from "@/lib/period";

export type LineKind = "income" | "expense" | "savings";

/** One categorised money line: a transaction, or one split of it. Transfers/hidden excluded. */
export interface Line {
  txId: number;
  date: string;
  month: string;
  amountCents: number;
  payee: string;
  category: string | null;
  kat0: string;
  kat1: string;
  kat2: string;
  fixed: boolean;
  kind: LineKind;
}

export const UNCATEGORIZED = "Unkategorisiert";
const INCOME_GROUP = "Einnahme";
const SAVINGS_GROUP = "Sparen";
const REFUND_GROUP = "Erstattung";

let categoryCache: { at: number; byKey: Map<string, Category> } | null = null;

export function categoryMap(): Map<string, Category> {
  if (categoryCache && Date.now() - categoryCache.at < 2000) return categoryCache.byKey;
  const byKey = new Map(db.select().from(categories).all().map((c) => [c.nameKey, c]));
  categoryCache = { at: Date.now(), byKey };
  return byKey;
}

/** Refund categories ("Amazon Flora Erstattung") are booked against their base category's group. */
function effective(categoryName: string | null, cats: Map<string, Category>) {
  const c = categoryName ? cats.get(normalizeKey(categoryName)) : undefined;
  if (!c || !c.kat0) return { kat0: UNCATEGORIZED, kat1: UNCATEGORIZED, kat2: "", fixed: false };
  if (c.kat0 === REFUND_GROUP) {
    const base = cats.get(normalizeKey(c.name.replace(/\s+Erstattung$/i, "")));
    if (base?.kat0) return { kat0: base.kat0, kat1: base.kat1, kat2: base.kat2, fixed: base.fixed };
    return { kat0: c.kat1.replace(/\s+Erstattung$/i, "") || REFUND_GROUP, kat1: c.kat1, kat2: c.kat2, fixed: false };
  }
  return { kat0: c.kat0, kat1: c.kat1, kat2: c.kat2, fixed: c.fixed };
}

export function getLines(range: { from: string; to: string }, accountId?: number): Line[] {
  const conds = [
    sql`${transactions.bookingDate} between ${range.from} and ${range.to}`,
    eq(transactions.hidden, false),
    eq(transactions.isTransfer, false),
  ];
  if (accountId) conds.push(eq(transactions.accountId, accountId));
  const txs = db.select().from(transactions).where(and(...conds)).all();
  const splitRows = txs.length
    ? db.select().from(splits).where(sql`${splits.transactionId} in (select id from transactions where ${and(...conds)})`).all()
    : [];
  const splitsByTx = Map.groupBy(splitRows, (s) => s.transactionId);
  const cats = categoryMap();

  const out: Line[] = [];
  for (const t of txs) {
    const parts = splitsByTx.get(t.id) ?? [{ amountCents: t.amountCents, category: t.category }];
    for (const p of parts) {
      const e = effective(p.category, cats);
      let kind: LineKind = "expense";
      if (e.kat0 === INCOME_GROUP) kind = "income";
      else if (e.kat0 === SAVINGS_GROUP) kind = "savings";
      else if (p.amountCents > 0) kind = "income";
      out.push({
        txId: t.id, date: t.bookingDate, month: t.bookingDate.slice(0, 7), amountCents: p.amountCents,
        payee: t.payee ?? (t.rawName || t.bookingType), category: p.category, ...e, kind,
      });
    }
  }
  return out;
}

export interface Bucket {
  key: string;
  group?: string;
  cents: number;
  count: number;
}

export function sumBy(lines: Line[], key: (l: Line) => string, sign = -1, group?: (l: Line) => string): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const l of lines) {
    const k = key(l);
    const b = m.get(k) ?? { key: k, group: group?.(l), cents: 0, count: 0 };
    b.cents += sign * l.amountCents;
    b.count++;
    m.set(k, b);
  }
  return [...m.values()].filter((b) => b.cents !== 0).sort((a, b) => b.cents - a.cents);
}

export function monthlyByKey(lines: Line[], range: { from: string; to: string }, key: (l: Line) => string, sign = -1) {
  const months = monthsInPeriod(range);
  const rows = months.map((m) => ({ month: m } as Record<string, number | string>));
  const idx = new Map(months.map((m, i) => [m, i]));
  for (const l of lines) {
    const i = idx.get(l.month);
    if (i === undefined) continue;
    const k = key(l);
    rows[i][k] = ((rows[i][k] as number) ?? 0) + sign * l.amountCents;
  }
  return rows;
}

/** Monthly net amount for one payee (coalesce(payee, rawName) match), across its full lifetime. */
export function payeeHistory(payee: string): { months: Array<{ month: string; cents: number; count: number }>; total: number } {
  const payeeKey = sql`coalesce(${transactions.payee}, ${transactions.rawName})`;
  const rows = db.select().from(transactions)
    .where(and(eq(transactions.hidden, false), eq(transactions.isTransfer, false), sql`${payeeKey} = ${payee}`))
    .all();
  if (!rows.length) return { months: [], total: 0 };
  const dates = rows.map((t) => t.bookingDate).sort();
  const range = monthsInPeriod({ from: dates[0], to: dates.at(-1)! });
  const idx = new Map(range.map((m, i) => [m, i]));
  const months = range.map((m) => ({ month: m, cents: 0, count: 0 }));
  let total = 0;
  for (const t of rows) {
    const i = idx.get(t.bookingDate.slice(0, 7));
    if (i === undefined) continue;
    months[i].cents += t.amountCents;
    months[i].count++;
    total += t.amountCents;
  }
  return { months, total };
}

// ---------------------------------------------------------------- transactions list

export type TxTab = "all" | "review" | "uncategorized" | "split" | "hidden" | "pending";

export interface TxFilter {
  from: string;
  to: string;
  q?: string;
  tab?: TxTab;
  type?: "in" | "out";
  accountId?: number;
  kat0?: string;
  kat1?: string;
  category?: string;
  payee?: string;
  excludePayee?: string;
  month?: string;
  limit?: number;
}

export interface TxRow extends Transaction {
  splits: Split[];
  kat0: string | null;
  kat1: string | null;
  accountName: string;
}

export function listTransactions(f: TxFilter): { rows: TxRow[]; total: number; inCents: number; outCents: number; review: number } {
  const conds = [sql`${transactions.bookingDate} between ${f.month ? `${f.month}-01` : f.from} and ${f.month ? `${f.month}-31` : f.to}`];
  const tab = f.tab ?? "all";
  if (tab === "hidden") conds.push(eq(transactions.hidden, true));
  else conds.push(eq(transactions.hidden, false));
  if (tab === "review") conds.push(eq(transactions.needsReview, true));
  if (tab === "uncategorized") conds.push(sql`${transactions.category} is null and not exists (select 1 from splits s where s.transaction_id = ${transactions.id})`);
  if (tab === "split") conds.push(sql`exists (select 1 from splits s where s.transaction_id = ${transactions.id})`);
  if (tab === "pending") conds.push(eq(transactions.status, "pending"));
  if (f.type === "in") conds.push(sql`${transactions.amountCents} > 0`);
  if (f.type === "out") conds.push(sql`${transactions.amountCents} < 0`);
  if (f.accountId) conds.push(eq(transactions.accountId, f.accountId));
  const payeeKey = sql`coalesce(${transactions.payee}, ${transactions.rawName})`;
  if (f.payee) {
    const list = f.payee.split(",").filter(Boolean);
    if (list.length > 1) conds.push(sql`${payeeKey} in ${list}`);
    else if (list.length === 1) conds.push(sql`${payeeKey} = ${list[0]}`);
  }
  if (f.excludePayee) {
    const list = f.excludePayee.split(",").filter(Boolean);
    if (list.length) conds.push(sql`${payeeKey} not in ${list}`);
  }
  if (f.category) {
    conds.push(sql`(${transactions.category} = ${f.category} or exists (select 1 from splits s where s.transaction_id = ${transactions.id} and s.category = ${f.category}))`);
  }
  for (const level of ["kat0", "kat1"] as const) {
    const want = f[level];
    if (!want) continue;
    if (want === UNCATEGORIZED) {
      conds.push(sql`${transactions.category} is null`);
      continue;
    }
    const cats = categoryMap();
    const names = [...cats.values()].filter((c) => effective(c.name, cats)[level] === want).map((c) => c.name);
    if (names.length) {
      conds.push(sql`(${transactions.category} in ${names} or exists (select 1 from splits s where s.transaction_id = ${transactions.id} and s.category in ${names}))`);
    } else conds.push(sql`0`);
  }
  if (f.q?.trim()) {
    const q = f.q.trim();
    const amount = q.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
    const like = `%${q}%`;
    if (/^-?\d+(\.\d+)?$/.test(amount)) {
      const cents = Math.round(Math.abs(Number(amount)) * 100);
      conds.push(sql`abs(${transactions.amountCents}) = ${cents}`);
    } else {
      conds.push(sql`(${transactions.payee} like ${like} or ${transactions.rawName} like ${like} or ${transactions.purpose} like ${like}
        or ${transactions.comment} like ${like} or ${transactions.category} like ${like})`);
    }
  }
  const where = and(...conds);
  const agg = db.select({
    total: sql<number>`count(*)`,
    inCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} > 0 then ${transactions.amountCents} end), 0)`,
    outCents: sql<number>`coalesce(sum(case when ${transactions.amountCents} < 0 then ${transactions.amountCents} end), 0)`,
    review: sql<number>`coalesce(sum(${transactions.needsReview}), 0)`,
  }).from(transactions).where(where).get()!;

  const rows = db.select({ t: transactions, accountName: accounts.name })
    .from(transactions).innerJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(where).orderBy(desc(transactions.bookedAt), desc(transactions.id)).limit(f.limit ?? 500).all();

  const ids = rows.map((r) => r.t.id);
  const splitRows = ids.length ? db.select().from(splits).where(sql`${splits.transactionId} in ${ids}`).all() : [];
  const byTx = Map.groupBy(splitRows, (s) => s.transactionId);
  const cats = categoryMap();
  return {
    ...agg,
    rows: rows.map(({ t, accountName }) => {
      const c = t.category ? cats.get(normalizeKey(t.category)) : undefined;
      return { ...t, accountName, splits: byTx.get(t.id) ?? [], kat0: c?.kat0 ?? null, kat1: c?.kat1 ?? null };
    }),
  };
}

export function reviewCounts() {
  return db.select({
    review: sql<number>`coalesce(sum(case when ${transactions.needsReview} and not ${transactions.hidden} then 1 end), 0)`,
    uncategorized: sql<number>`coalesce(sum(case when ${transactions.category} is null and not ${transactions.hidden}
      and not exists (select 1 from splits s where s.transaction_id = ${transactions.id}) then 1 end), 0)`,
  }).from(transactions).get()!;
}

// ---------------------------------------------------------------- lookups

export function listCategories(): Category[] {
  return db.select().from(categories).orderBy(asc(categories.kat0), asc(categories.name)).all();
}

export function listPayees(): string[] {
  const fromTx = db.selectDistinct({ p: transactions.payee }).from(transactions).all().map((r) => r.p);
  const fromMap = db.selectDistinct({ p: payeeMappings.payee }).from(payeeMappings).all().map((r) => r.p);
  return [...new Set([...fromTx, ...fromMap].filter((p): p is string => !!p))].sort((a, b) => a.localeCompare(b, "de"));
}

export function listMappings() {
  return db.select().from(payeeMappings).orderBy(asc(payeeMappings.rawKey)).all();
}

export function listRules() {
  return db.select().from(rules).orderBy(asc(rules.priority), asc(rules.id)).all();
}

export function listAccounts(): Account[] {
  return db.select().from(accounts).orderBy(asc(accounts.id)).all();
}

export function listImports() {
  return db.select({ i: imports, accountName: accounts.name }).from(imports)
    .leftJoin(accounts, eq(accounts.id, imports.accountId)).orderBy(desc(imports.id)).all();
}

export function listLoans(): Loan[] {
  return db.select().from(loans).orderBy(asc(loans.id)).all();
}

// ---------------------------------------------------------------- balances / net worth

export interface AccountBalance {
  account: Account;
  balanceCents: number | null;
  /** Month-end balances, YYYY-MM → cents. */
  series: Map<string, number>;
  lastSnapshot: string | null;
}

export function accountBalances(range: { from: string; to: string }): AccountBalance[] {
  const months = monthsInPeriod(range);
  const today = iso(new Date());
  return listAccounts().map((account) => {
    const snaps = db.select().from(balanceSnapshots).where(eq(balanceSnapshots.accountId, account.id))
      .orderBy(asc(balanceSnapshots.date), asc(balanceSnapshots.id)).all();
    const daily = db.select({ d: transactions.bookingDate, c: sql<number>`sum(${transactions.amountCents})` })
      .from(transactions).where(eq(transactions.accountId, account.id))
      .groupBy(transactions.bookingDate).orderBy(asc(transactions.bookingDate)).all();

    const at = (date: string): number | null => {
      // Nearest snapshot (prefer latest on/before date, else earliest after) + tx in between.
      const before = snaps.filter((s) => s.date <= date).at(-1);
      const anchor = before ?? snaps[0];
      if (!anchor) return daily.length && account.type !== "asset" && account.type !== "depot"
        ? daily.filter((x) => x.d <= date).reduce((a, x) => a + x.c, 0) : null;
      let bal = anchor.balanceCents;
      for (const x of daily) {
        if (anchor.date < x.d && x.d <= date) bal += x.c;
        if (date < x.d && x.d <= anchor.date) bal -= x.c;
      }
      return bal;
    };

    const series = new Map<string, number>();
    for (const m of months) {
      const end = `${m}-31` > today ? today : `${m}-31`;
      if (`${m}-01` > today) break;
      const v = at(end);
      if (v != null) series.set(m, v);
    }
    return { account, balanceCents: at(today), series, lastSnapshot: snaps.at(-1)?.date ?? null };
  });
}

export interface LoanStatus {
  loan: Loan;
  paidCents: number;
  remainingCents: number;
  payments: Transaction[];
}

export function loanStatuses(): LoanStatus[] {
  return listLoans().map((loan) => {
    const like = `%${loan.matchText}%`;
    const payments = db.select().from(transactions).where(and(
      sql`${transactions.bookingDate} >= ${loan.startDate}`,
      sql`(${transactions.payee} like ${like} or ${transactions.purpose} like ${like} or ${transactions.rawName} like ${like})`,
    )).orderBy(desc(transactions.bookingDate)).all();
    // Liability: our outgoing payments reduce it. Asset (lent money): incoming payments reduce it.
    const paidCents = payments.reduce((a, t) => a + (loan.isLiability ? -t.amountCents : t.amountCents), 0);
    return { loan, paidCents, remainingCents: loan.principalCents - paidCents, payments };
  });
}

export function categoryVariants(payee: string | null): Category[] {
  if (!payee) return [];
  const k = normalizeKey(payee);
  return [...categoryMap().values()].filter((c) => c.nameKey === k || c.nameKey.startsWith(`${k} `));
}

export function getTransaction(id: number) {
  return db.select().from(transactions).where(eq(transactions.id, id)).get();
}

/** "Alles" means from the first booking until today – not since 1900. */
export function clampPeriod<P extends { from: string; to: string; preset: string }>(p: P): P {
  if (p.preset !== "all") return p;
  const r = db.select({ min: sql<string | null>`min(${transactions.bookingDate})` }).from(transactions).get();
  const s = db.select({ min: sql<string | null>`min(${balanceSnapshots.date})` }).from(balanceSnapshots).get();
  const from = [r?.min, s?.min].filter((x): x is string => !!x).sort()[0] ?? iso(new Date());
  return { ...p, from, to: iso(new Date()) };
}
