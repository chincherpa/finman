"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import type { Account, Category } from "@/db/schema";
import { addTransaction } from "@/app/actions";
import { iso } from "@/lib/period";
import { CategoryInput } from "./category-input";

export function AddTransaction({ accounts, categories, payees, onClose }: {
  accounts: Account[]; categories: Category[]; payees: string[]; onClose: () => void;
}) {
  const [f, setF] = useState({ accountId: accounts[0]?.id ?? 0, date: iso(new Date()), amount: "", payee: "", category: "", comment: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!accounts.length) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/20" onClick={onClose}>
        <div className="card p-5 text-sm">Erst ein Konto anlegen (Konten) oder CSV importieren.</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20" onClick={onClose}>
      <form
        className="card flex w-[420px] flex-col gap-3 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await addTransaction(f);
            if (r.ok) onClose();
            else setError(r.error);
          });
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Umsatz hinzufügen</h2>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>
        <label className="label">Konto
          <select className="input mt-1" value={f.accountId} onChange={(e) => setF({ ...f, accountId: Number(e.target.value) })}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="label">Datum<input type="date" className="input mt-1" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          <label className="label">Betrag (− für Ausgabe)<input className="input num mt-1" placeholder="-12,50" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></label>
        </div>
        <label className="label">Empfänger<input className="input mt-1" list="add-payees" value={f.payee} onChange={(e) => setF({ ...f, payee: e.target.value })} /></label>
        <datalist id="add-payees">{payees.map((p) => <option key={p} value={p} />)}</datalist>
        <div className="label">Kategorie<div className="mt-1"><CategoryInput categories={categories} value={f.category} suggestFor={f.payee} onChange={(v) => setF({ ...f, category: v })} /></div></div>
        <label className="label">Kommentar<input className="input mt-1" value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} /></label>
        {error && <p className="text-[13px] text-negative">{error}</p>}
        <button className="btn btn-primary justify-center" disabled={pending}>Hinzufügen</button>
      </form>
    </div>
  );
}
