import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accountTypes = ["checking", "savings", "cash", "depot", "loan", "asset"] as const;
export type AccountType = (typeof accountTypes)[number];

export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  accountNumber: text("account_number").unique(),
  iban: text("iban"),
  type: text("type", { enum: accountTypes }).notNull().default("checking"),
  currency: text("currency").notNull().default("EUR"),
  includeInNetWorth: integer("include_in_net_worth", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const imports = sqliteTable("imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  accountId: integer("account_id").references(() => accounts.id),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  rowsNew: integer("rows_new").notNull().default(0),
  rowsDuplicate: integer("rows_duplicate").notNull().default(0),
  rowsReplaced: integer("rows_replaced").notNull().default(0),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Clean payee name as used in werte.csv ("Name"). */
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
  kat0: text("kat0").notNull().default(""),
  kat1: text("kat1").notNull().default(""),
  kat2: text("kat2").notNull().default(""),
  fixed: integer("fixed", { mode: "boolean" }).notNull().default(false),
});

export const payeeMappings = sqliteTable("payee_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  rawName: text("raw_name").notNull(),
  /** Normalised raw recipient (lowercase, collapsed whitespace). */
  rawKey: text("raw_key").notNull().unique(),
  payee: text("payee").notNull(),
  defaultComment: text("default_comment").notNull().default(""),
});

export const ruleFields = ["raw_name", "purpose", "iban", "payee", "booking_type"] as const;
export const ruleOps = ["contains", "equals", "regex"] as const;

export const rules = sqliteTable("rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().default(""),
  priority: integer("priority").notNull().default(100),
  field: text("field", { enum: ruleFields }).notNull(),
  op: text("op", { enum: ruleOps }).notNull().default("contains"),
  value: text("value").notNull(),
  /** Optional second condition, ANDed with the first. */
  field2: text("field2", { enum: ruleFields }),
  op2: text("op2", { enum: ruleOps }),
  value2: text("value2"),
  amountMinCents: integer("amount_min_cents"),
  amountMaxCents: integer("amount_max_cents"),
  setPayee: text("set_payee"),
  setCategory: text("set_category"),
  setComment: text("set_comment"),
  setTransfer: integer("set_transfer", { mode: "boolean" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id").notNull().references(() => accounts.id),
    importId: integer("import_id").references(() => imports.id),
    /** ISO datetime "YYYY-MM-DDTHH:MM". */
    bookedAt: text("booked_at").notNull(),
    /** ISO date "YYYY-MM-DD" (Buchungstag). */
    bookingDate: text("booking_date").notNull(),
    valueDate: text("value_date"),
    amountCents: integer("amount_cents").notNull(),
    bookingType: text("booking_type").notNull().default(""),
    rawName: text("raw_name").notNull().default(""),
    iban: text("iban").notNull().default(""),
    bic: text("bic").notNull().default(""),
    creditorId: text("creditor_id").notNull().default(""),
    mandateRef: text("mandate_ref").notNull().default(""),
    purpose: text("purpose").notNull().default(""),
    e2eId: text("e2e_id").notNull().default(""),
    terminalId: text("terminal_id"),
    status: text("status", { enum: ["pending", "booked"] }).notNull().default("booked"),
    hash: text("hash").notNull(),
    payee: text("payee"),
    /** References categories.name (werte "Name"). */
    category: text("category"),
    comment: text("comment").notNull().default(""),
    needsReview: integer("needs_review", { mode: "boolean" }).notNull().default(true),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    isTransfer: integer("is_transfer", { mode: "boolean" }).notNull().default(false),
    resolvedBy: text("resolved_by", { enum: ["rule", "mapping", "category", "manual"] }),
  },
  (t) => [
    uniqueIndex("transactions_hash_idx").on(t.hash),
    index("transactions_date_idx").on(t.bookingDate),
    index("transactions_account_idx").on(t.accountId),
  ],
);

export const splits = sqliteTable("splits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  transactionId: integer("transaction_id")
    .notNull()
    .references(() => transactions.id, { onDelete: "cascade" }),
  amountCents: integer("amount_cents").notNull(),
  category: text("category"),
  comment: text("comment").notNull().default(""),
});

export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    source: text("source", { enum: ["endsaldo", "manual"] }).notNull().default("manual"),
  },
  (t) => [uniqueIndex("balance_snapshots_account_date_idx").on(t.accountId, t.date, t.source)],
);

export const loans = sqliteTable("loans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  counterparty: text("counterparty").notNull().default(""),
  principalCents: integer("principal_cents").notNull(),
  interestRate: real("interest_rate").notNull().default(0),
  startDate: text("start_date").notNull(),
  /** Transactions whose payee or purpose contains this text count as repayments. */
  matchText: text("match_text").notNull(),
  /** true: we owe money (liability). false: money lent to someone (asset). */
  isLiability: integer("is_liability", { mode: "boolean" }).notNull().default(true),
});

export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type PayeeMapping = typeof payeeMappings.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type Split = typeof splits.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type BalanceSnapshot = typeof balanceSnapshots.$inferSelect;
