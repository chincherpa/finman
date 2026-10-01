import { normalizeKey } from "@/lib/format";
import type { Category, PayeeMapping, Rule } from "@/db/schema";

export interface ResolveInput {
  rawName: string;
  purpose: string;
  iban: string;
  amountCents: number;
  terminalId: string | null;
  bookingType: string;
}

export interface Resolution {
  payee: string | null;
  category: string | null;
  comment: string;
  isTransfer: boolean;
  needsReview: boolean;
  resolvedBy: "rule" | "mapping" | "category" | null;
}

export interface ResolveContext {
  rules: Rule[];
  mappingByKey: Map<string, PayeeMapping>;
  mappingByFuzzy: Map<string, PayeeMapping>;
  /** Terminal id (from "GIR 12345678" / "EC 12345678") → payee, for pending card payments. */
  payeeByTerminal: Map<string, string>;
  categoryByKey: Map<string, Category>;
}

/**
 * Looser key for recipients that carry store numbers or addresses:
 * "BAECKEREI U KONDITOREI TREI 28 GIR 79982677//STUTTGART/DE" → "baeckerei u konditorei trei".
 */
export function fuzzyKey(raw: string): string {
  let s = normalizeKey(raw);
  s = s.split("/")[0];
  s = s.replace(/\bgir \d+/g, " ").replace(/\bfil\.\S*/g, " ").replace(/\bh:\d+/g, " ");
  s = s.replace(/\b\d[\d.-]*\b/g, " ");
  // Legal forms: "gmbh + co. kg", "se u. co. kg", "ag", "e.k." …
  s = s.replace(/(\s|^)(gmbh|ggmbh|ag|se|kg|ohg|gbr|e\.?\s?k\.?|e\.?\s?v\.?|co\.?|u\.|und|\+|&)(?=\s|$)/g, " ");
  s = s.replace(/[.,:;\-+\s]+$/g, "").replace(/^[.,:;\-+\s]+/g, "");
  return s.replace(/\s+/g, " ").trim();
}

const MIN_PREFIX = 8;

/** Mapping targets like "Amazon X", "Paypal" or "X Hannah oder Lutz" need a human decision. */
export function isPlaceholderPayee(payee: string): boolean {
  const p = normalizeKey(payee);
  return / x$/.test(p) || / oder /.test(p) || p === "paypal" || p === "amazon";
}

export function buildContext(
  mappings: PayeeMapping[],
  categoryRows: Category[],
  ruleRows: Rule[],
  knownTerminals: Array<{ terminalId: string; payee: string }> = [],
): ResolveContext {
  const mappingByKey = new Map<string, PayeeMapping>();
  const fuzzy = new Map<string, PayeeMapping | null>();
  const payeeByTerminal = new Map<string, string>();

  for (const m of mappings) {
    mappingByKey.set(m.rawKey, m);
    const fk = fuzzyKey(m.rawName);
    if (fk.length >= 3) {
      const prev = fuzzy.get(fk);
      // Conflicting payees for the same fuzzy key → unusable.
      if (prev === undefined) fuzzy.set(fk, m);
      else if (prev && normalizeKey(prev.payee) !== normalizeKey(m.payee)) fuzzy.set(fk, null);
    }
    const gir = m.rawName.match(/\bgir (\d{6,})/i);
    if (gir) payeeByTerminal.set(gir[1], m.payee);
  }
  for (const t of knownTerminals) payeeByTerminal.set(t.terminalId, t.payee);

  const mappingByFuzzy = new Map<string, PayeeMapping>();
  for (const [k, v] of fuzzy) if (v) mappingByFuzzy.set(k, v);

  return {
    rules: ruleRows.filter((r) => r.active).sort((a, b) => a.priority - b.priority || a.id - b.id),
    mappingByKey,
    mappingByFuzzy,
    payeeByTerminal,
    categoryByKey: new Map(categoryRows.filter((c) => c.kat0).map((c) => [c.nameKey, c])),
  };
}

function fieldValue(field: Rule["field"], input: ResolveInput, payee: string | null): string {
  switch (field) {
    case "raw_name":
      return input.rawName;
    case "purpose":
      return input.purpose;
    case "iban":
      return input.iban;
    case "payee":
      return payee ?? "";
    case "booking_type":
      return input.bookingType;
  }
}

function test(op: Rule["op"], haystack: string, needle: string): boolean {
  if (op === "equals") return normalizeKey(haystack) === normalizeKey(needle);
  if (op === "regex") {
    try {
      return new RegExp(needle, "i").test(haystack);
    } catch {
      return false;
    }
  }
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function ruleMatches(rule: Rule, input: ResolveInput, payee: string | null): boolean {
  if (!test(rule.op, fieldValue(rule.field, input, payee), rule.value)) return false;
  if (rule.field2 && rule.value2 && !test(rule.op2 ?? "contains", fieldValue(rule.field2, input, payee), rule.value2))
    return false;
  const abs = Math.abs(input.amountCents);
  if (rule.amountMinCents != null && abs < rule.amountMinCents) return false;
  if (rule.amountMaxCents != null && abs > rule.amountMaxCents) return false;
  return true;
}

export function findMapping(rawName: string, ctx: ResolveContext): PayeeMapping | undefined {
  if (!rawName) return undefined;
  const exact = ctx.mappingByKey.get(normalizeKey(rawName));
  if (exact) return exact;
  const fk = fuzzyKey(rawName);
  const fuzzy = ctx.mappingByFuzzy.get(fk);
  if (fuzzy) return fuzzy;
  // Longest mapping key that is a word-prefix of the raw name ("stuttgarter heimschutz ott" → "stuttgarter heimschutz").
  const words = fk.split(" ");
  for (let n = words.length - 1; n >= 1; n--) {
    const prefix = words.slice(0, n).join(" ");
    if (prefix.length < MIN_PREFIX) break;
    const hit = ctx.mappingByFuzzy.get(prefix);
    if (hit) return hit;
  }
  return undefined;
}

/** mapping (exact → fuzzy → terminal → direct category name) → rules override → category lookup. */
export function resolve(input: ResolveInput, ctx: ResolveContext): Resolution {
  let payee: string | null = null;
  let comment = "";
  let category: string | null = null;
  let isTransfer = false;
  let resolvedBy: Resolution["resolvedBy"] = null;

  const mapping = findMapping(input.rawName, ctx);
  if (mapping) {
    payee = mapping.payee;
    comment = mapping.defaultComment;
    resolvedBy = "mapping";
  } else if (input.terminalId && ctx.payeeByTerminal.has(input.terminalId)) {
    payee = ctx.payeeByTerminal.get(input.terminalId)!;
    resolvedBy = "mapping";
  } else if (input.rawName) {
    const direct = ctx.categoryByKey.get(normalizeKey(input.rawName)) ?? ctx.categoryByKey.get(fuzzyKey(input.rawName));
    if (direct) {
      payee = direct.name;
      resolvedBy = "category";
    } else {
      // werte has variants like "New York City Dance School Flora" → payee is the shared base, category left open.
      const fk = fuzzyKey(input.rawName);
      if (fk.length >= MIN_PREFIX) {
        for (const c of ctx.categoryByKey.values()) {
          if (c.nameKey.startsWith(`${fk} `)) {
            payee = c.name.slice(0, fk.length);
            resolvedBy = "category";
            break;
          }
        }
      }
    }
  }

  const rule = ctx.rules.find((r) => ruleMatches(r, input, payee));
  if (rule) {
    if (rule.setPayee) payee = rule.setPayee;
    if (rule.setComment != null && rule.setComment !== "") comment = rule.setComment;
    if (rule.setCategory) category = rule.setCategory;
    if (rule.setTransfer) isTransfer = true;
    resolvedBy = "rule";
  }

  if (!category && payee) {
    const c = ctx.categoryByKey.get(normalizeKey(payee));
    if (c) category = c.name;
  }

  // A rule that sets an explicit category is a deliberate decision, even for placeholder payees.
  const needsReview = !payee || !category || (isPlaceholderPayee(payee) && !rule?.setCategory);
  return { payee, category, comment, isTransfer, needsReview, resolvedBy };
}
