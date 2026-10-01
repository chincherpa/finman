import iconv from "iconv-lite";
import Papa from "papaparse";
import { createHash } from "node:crypto";
import { parseGermanAmount, parseGermanDate, parseGermanDateTime } from "@/lib/format";

export type RowKind = "normal" | "pending" | "balance" | "skip";

export interface ParsedRow {
  kind: RowKind;
  accountNumber: string;
  bookedAt: string;
  bookingDate: string;
  valueDate: string | null;
  amountCents: number;
  bookingType: string;
  rawName: string;
  iban: string;
  bic: string;
  creditorId: string;
  mandateRef: string;
  purpose: string;
  e2eId: string;
  terminalId: string | null;
  /** Only for kind = "balance": the closing balance ("Endsaldo"). */
  balanceCents?: number;
  hash: string;
}

/** Decode a bank export. Sparkasse/BW-Bank exports are Latin-1, but accept UTF-8 too. */
export function decodeBankFile(buf: Buffer): string {
  let text: string;
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const utf8 = buf.toString("utf8");
  if (hasBom) text = utf8.slice(1);
  else if (!utf8.includes("�")) text = utf8;
  else text = iconv.decode(buf, "latin1");
  return text;
}

/**
 * Join the 27-char "Vwz.N" chunks. The bank appends a second, re-wrapped copy
 * of the purpose after an "SVWZ+" marker – we drop everything from there on.
 */
export function joinPurpose(chunks: string[]): string {
  const out: string[] = [];
  for (const c of chunks) {
    if (c.startsWith("SVWZ+")) break;
    out.push(c);
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

export function extractTerminalId(rawName: string, purpose: string): string | null {
  const gir = rawName.match(/\bGIR (\d{6,})/i);
  if (gir) return gir[1];
  const ec = purpose.match(/^EC (\d{6,})/);
  return ec ? ec[1] : null;
}

export function rowHash(r: Pick<ParsedRow, "accountNumber" | "bookedAt" | "amountCents" | "rawName" | "purpose" | "e2eId">): string {
  return createHash("sha1")
    .update([r.accountNumber, r.bookedAt, r.amountCents, r.rawName, r.purpose, r.e2eId].join("|"))
    .digest("hex");
}

type Raw = Record<string, string>;

function pick(row: Raw, ...names: string[]): string {
  for (const n of names) {
    if (row[n] !== undefined) return row[n].trim();
  }
  return "";
}

export function parseBankCsv(input: Buffer | string): ParsedRow[] {
  const text = typeof input === "string" ? input : decodeBankFile(input);
  const { data } = Papa.parse<Raw>(text, { header: true, delimiter: ";", skipEmptyLines: true });
  // Identical rows (same shop, amount and minute) are legit – number them so hashes stay unique.
  const seen = new Map<string, number>();

  return data.map((row) => {
    const vwz = Object.keys(row)
      .filter((k) => /^Vwz\.\d+$/.test(k))
      .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
      .map((k) => row[k] ?? "");
    const purpose = joinPurpose(vwz);
    const bookingType = pick(row, "Buchungsart");
    const rawName = pick(row, "Empfänger/Auftraggeber Name").replace(/\s+/g, " ");
    const amountCents = parseGermanAmount(pick(row, "Soll/Haben"));
    const bookingDate = parseGermanDate(pick(row, "Buchungstag")) ?? "";
    const bookedAt = parseGermanDateTime(pick(row, "Datum/Zeit")) ?? `${bookingDate}T00:00`;

    let kind: RowKind = "normal";
    let balanceCents: number | undefined;
    const saldo = purpose.match(/\*\*Endsaldo\*\*\s*([\d.]+,\d{2})([HS])/);
    if (saldo) {
      kind = "balance";
      balanceCents = parseGermanAmount(saldo[1]) * (saldo[2] === "S" ? -1 : 1);
      if (amountCents === 0) kind = "skip";
    } else if (bookingType === "Kartenzahlung/-en") {
      kind = "pending";
    }

    const parsed: Omit<ParsedRow, "hash"> = {
      kind,
      accountNumber: pick(row, "Kontonummer"),
      bookedAt,
      bookingDate,
      valueDate: parseGermanDate(pick(row, "Wertstellung")),
      amountCents,
      bookingType,
      rawName: kind === "pending" ? "" : rawName,
      iban: pick(row, "Empfänger/Auftraggeber IBAN"),
      bic: pick(row, "Empfänger/Auftraggeber BIC"),
      creditorId: pick(row, "Glaeubiger-ID"),
      mandateRef: pick(row, "Mandatsreferenz"),
      purpose,
      e2eId: pick(row, "End-to-End-Identifikation"),
      terminalId: extractTerminalId(rawName, purpose),
      balanceCents,
    };
    const base = rowHash(parsed);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { ...parsed, hash: n === 0 ? base : `${base}-${n}` };
  });
}
