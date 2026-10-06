"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Trash2, X } from "lucide-react";
import type { Category, Rule } from "@/db/schema";
import type { TxRow } from "@/lib/queries";
import { formatDate, formatEur } from "@/lib/format";
import { deleteTransaction, setSplits, updateTransaction } from "@/app/actions";
import { CategoryInput } from "./category-input";

interface Props {
  tx: TxRow;
  categories: Category[];
  payees: string[];
  onClose: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}

type SplitDraft = { amount: string; category: string; comment: string };

const toInput = (cents: number) => (Math.abs(cents) / 100).toFixed(2).replace(".", ",");

export function TxEditor({ tx, categories, payees, onClose, onNext, onPrev }: Props) {
  const [payee, setPayee] = useState(tx.payee ?? tx.rawName ?? "");
  const [category, setCategory] = useState(tx.category ?? "");
  const [comment, setComment] = useState(tx.comment);
  const [hidden, setHidden] = useState(tx.hidden);
  const [isTransfer, setTransfer] = useState(tx.isTransfer);
  const [saveMapping, setSaveMapping] = useState(false);
  const [ruleOn, setRuleOn] = useState(false);
  const [rule, setRule] = useState<{ field: Rule["field"]; op: Rule["op"]; value: string; setCategory: boolean }>({
    field: tx.rawName ? "purpose" : "raw_name", op: "contains", value: "", setCategory: true,
  });
  const [splits, setSplitDrafts] = useState<SplitDraft[]>(
    tx.splits.map((s) => ({ amount: toInput(s.amountCents), category: s.category ?? "", comment: s.comment })),
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const splitSum = splits.reduce((a, s) => a + Math.round(Number(s.amount.replace(/\./g, "").replace(",", ".")) * 100 || 0), 0);
  const splitRest = Math.abs(tx.amountCents) - splitSum;

  const save = (andNext: boolean) => start(async () => {
    setError(null);
    const r = await updateTransaction({
      id: tx.id, payee: payee || null, category: splits.length ? null : category || null, comment, hidden, isTransfer,
      saveMapping, rule: ruleOn ? rule : null,
    });
    if (!r.ok) return setError(r.error);
    if (splits.length || tx.splits.length) {
      const s = await setSplits(tx.id, splits);
      if (!s.ok) return setError(s.error);
    }
    if (r.data?.reResolved) setInfo(`${r.data.reResolved} weitere Umsätze automatisch zugeordnet.`);
    if (andNext && onNext) onNext();
    else if (!r.data?.reResolved) onClose();
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/15" onClick={onClose}>
      <aside className="flex h-full w-[460px] flex-col overflow-y-auto bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex gap-1">
            <button className="btn px-2" onClick={onPrev} disabled={!onPrev} aria-label="Vorheriger"><ChevronUp size={15} /></button>
            <button className="btn px-2" onClick={onNext} disabled={!onNext} aria-label="Nächster"><ChevronDown size={15} /></button>
          </div>
          <button onClick={onClose} aria-label="Schließen"><X size={18} /></button>
        </div>

        <div className="border-b border-border px-5 py-4">
          <div className={`num text-2xl font-semibold ${tx.amountCents > 0 ? "text-positive" : ""}`}>
            {formatEur(tx.amountCents, { sign: true })}
          </div>
          <div className="mt-1 text-xs text-muted">
            {formatDate(tx.bookingDate)} · {tx.bookingType} · {tx.accountName}
            {tx.status === "pending" && " · vorgemerkt"}
          </div>
        </div>

        <form className="flex flex-col gap-4 px-5 py-4" onSubmit={(e) => { e.preventDefault(); save(true); }}>
          <label className="label">
            Empfänger
            <input className="input mt-1" list="payee-list" value={payee} onChange={(e) => setPayee(e.target.value)} autoFocus />
            <datalist id="payee-list">{payees.map((p) => <option key={p} value={p} />)}</datalist>
          </label>

          {splits.length === 0 && (
            <div className="label">
              Kategorie
              <div className="mt-1">
                <CategoryInput categories={categories} value={category} onChange={setCategory} suggestFor={payee} />
              </div>
            </div>
          )}

          <label className="label">
            Kommentar
            <input className="input mt-1" value={comment} onChange={(e) => setComment(e.target.value)} />
          </label>

          <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={isTransfer} onChange={(e) => setTransfer(e.target.checked)} /> Umbuchung (nicht in Auswertung)</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Ausblenden</label>
          </div>

          {/* Splits */}
          <section className="rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">Aufteilen</span>
              <button type="button" className="text-xs text-accent" onClick={() => setSplitDrafts((s) => [
                ...s, { amount: s.length === 0 ? toInput(tx.amountCents) : toInput(Math.max(splitRest, 0)), category: s.length === 0 ? category : "", comment: "" },
              ])}>+ Teil</button>
            </div>
            {splits.map((s, i) => (
              <div key={i} className="mt-2 grid grid-cols-[90px_1fr_24px] items-start gap-2">
                <input className="input num text-right" value={s.amount}
                  onChange={(e) => setSplitDrafts((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <div className="flex flex-col gap-1">
                  <CategoryInput categories={categories} value={s.category} suggestFor={payee}
                    onChange={(v) => setSplitDrafts((all) => all.map((x, j) => (j === i ? { ...x, category: v } : x)))} />
                  <input className="input" placeholder="Kommentar" value={s.comment}
                    onChange={(e) => setSplitDrafts((all) => all.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))} />
                </div>
                <button type="button" className="mt-2 text-muted" onClick={() => setSplitDrafts((all) => all.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            {splits.length > 0 && (
              <p className={`num mt-2 text-xs ${splitRest === 0 ? "text-muted" : "text-negative"}`}>
                Rest: {formatEur(splitRest)}
              </p>
            )}
          </section>

          {/* Learning */}
          <section className="flex flex-col gap-2 rounded-lg border border-border p-3 text-[13px]">
            {tx.rawName && (
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-0.5" checked={saveMapping} onChange={(e) => setSaveMapping(e.target.checked)} />
                <span>Zuordnung merken: <span className="text-muted">„{tx.rawName}“ → {payee || "…"}</span></span>
              </label>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={ruleOn} onChange={(e) => setRuleOn(e.target.checked)} /> Regel anlegen
            </label>
            {ruleOn && (
              <div className="flex flex-col gap-2 pl-6">
                <div className="flex gap-2">
                  <select className="input w-auto" value={rule.field} onChange={(e) => setRule({ ...rule, field: e.target.value as Rule["field"] })}>
                    <option value="purpose">Verwendungszweck</option>
                    <option value="raw_name">Empfänger (Bank)</option>
                    <option value="iban">IBAN</option>
                    <option value="booking_type">Buchungsart</option>
                  </select>
                  <select className="input w-auto" value={rule.op} onChange={(e) => setRule({ ...rule, op: e.target.value as Rule["op"] })}>
                    <option value="contains">enthält</option>
                    <option value="equals">ist gleich</option>
                    <option value="regex">Regex</option>
                  </select>
                </div>
                <input className="input" placeholder="Text, z. B. Spotify" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} />
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={rule.setCategory} onChange={(e) => setRule({ ...rule, setCategory: e.target.checked })} /> Kategorie mit setzen
                </label>
              </div>
            )}
          </section>

          {error && <p className="text-[13px] text-negative">{error}</p>}
          {info && <p className="text-[13px] text-positive">{info}</p>}

          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary flex-1 justify-center" disabled={pending}>
              Speichern{onNext ? " & weiter" : ""}
            </button>
            <button type="button" className="btn" disabled={pending} onClick={() => save(false)}>Speichern</button>
            {(tx.bookingType === "Manuell" || tx.status === "pending") && (
              <button type="button" className="btn text-negative" disabled={pending} aria-label="Löschen"
                onClick={() => start(async () => { await deleteTransaction(tx.id); onClose(); })}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </form>

        <dl className="mt-auto grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 border-t border-border bg-surface-2 px-5 py-4 text-xs">
          <dt className="text-muted">Bank-Empfänger</dt><dd className="break-words">{tx.rawName || "–"}</dd>
          <dt className="text-muted">Verwendungszweck</dt><dd className="break-words">{tx.purpose || "–"}</dd>
          <dt className="text-muted">IBAN</dt><dd>{tx.iban || "–"}</dd>
          <dt className="text-muted">Mandat</dt><dd>{tx.mandateRef || "–"}</dd>
          <dt className="text-muted">Wertstellung</dt><dd>{tx.valueDate ? formatDate(tx.valueDate, "short") : "–"}</dd>
          <dt className="text-muted">Zugeordnet via</dt><dd>{tx.resolvedBy ?? "–"}</dd>
        </dl>
      </aside>
    </div>
  );
}
