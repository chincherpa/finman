import Papa from "papaparse";
import { sql } from "drizzle-orm";
import { normalizeKey } from "@/lib/format";
import { decodeBankFile } from "./parse";
import { categories, payeeMappings } from "@/db/schema";
import type { DB } from "@/db/client";

export interface LookupImportResult {
  rows: number;
  inserted: number;
  updated: number;
  duplicatesInFile: string[];
}

function parseSemicolon(input: Buffer | string): string[][] {
  const text = typeof input === "string" ? input.replace(/^﻿/, "") : decodeBankFile(input);
  return Papa.parse<string[]>(text, { delimiter: ";", skipEmptyLines: true }).data;
}

/** mapping.csv: old;new;Comment */
export function importMappings(db: DB, input: Buffer | string): LookupImportResult {
  const [, ...rows] = parseSemicolon(input);
  const byKey = new Map<string, { rawName: string; rawKey: string; payee: string; defaultComment: string }>();
  const duplicatesInFile: string[] = [];
  for (const [oldName = "", payee = "", comment = ""] of rows) {
    const rawName = oldName.trim();
    if (!rawName || !payee.trim()) continue;
    const rawKey = normalizeKey(rawName);
    if (byKey.has(rawKey)) duplicatesInFile.push(rawName);
    byKey.set(rawKey, { rawName, rawKey, payee: payee.trim(), defaultComment: comment.trim() });
  }
  return upsert(db, "mappings", [...byKey.values()], rows.length, duplicatesInFile);
}

/** werte.csv: Name;Kategorie 0;Kategorie 1;Kategorie 2;Fix */
export function importCategories(db: DB, input: Buffer | string): LookupImportResult {
  const [, ...rows] = parseSemicolon(input);
  const byKey = new Map<string, typeof categories.$inferInsert>();
  const duplicatesInFile: string[] = [];
  for (const [name = "", k0 = "", k1 = "", k2 = "", fix = ""] of rows) {
    const n = name.trim();
    if (!n) continue;
    const nameKey = normalizeKey(n);
    if (byKey.has(nameKey)) duplicatesInFile.push(n);
    byKey.set(nameKey, {
      name: n,
      nameKey,
      kat0: k0.trim(),
      kat1: k1.trim(),
      kat2: k2.trim(),
      fixed: normalizeKey(fix) === "ja",
    });
  }
  return upsert(db, "categories", [...byKey.values()], rows.length, duplicatesInFile);
}

function upsert(
  db: DB,
  kind: "mappings" | "categories",
  values: Array<Record<string, unknown>>,
  rows: number,
  duplicatesInFile: string[],
): LookupImportResult {
  let inserted = 0;
  let updated = 0;
  db.transaction((tx) => {
    for (const v of values) {
      if (kind === "mappings") {
        const val = v as typeof payeeMappings.$inferInsert;
        const exists = tx.select({ id: payeeMappings.id }).from(payeeMappings).where(sql`${payeeMappings.rawKey} = ${val.rawKey}`).get();
        tx.insert(payeeMappings)
          .values(val)
          .onConflictDoUpdate({ target: payeeMappings.rawKey, set: { rawName: val.rawName, payee: val.payee, defaultComment: val.defaultComment } })
          .run();
        if (exists) updated++;
        else inserted++;
      } else {
        const val = v as typeof categories.$inferInsert;
        const exists = tx.select({ id: categories.id }).from(categories).where(sql`${categories.nameKey} = ${val.nameKey}`).get();
        tx.insert(categories)
          .values(val)
          .onConflictDoUpdate({ target: categories.nameKey, set: { name: val.name, kat0: val.kat0, kat1: val.kat1, kat2: val.kat2, fixed: val.fixed } })
          .run();
        if (exists) updated++;
        else inserted++;
      }
    }
  });
  return { rows, inserted, updated, duplicatesInFile };
}

export function toCsv(rows: string[][]): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + rows.map((r) => r.map(esc).join(";")).join("\r\n") + "\r\n";
}
