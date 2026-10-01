"use client";

import { useState, useTransition } from "react";
import type { Loan } from "@/db/schema";
import { deleteLoan, saveLoan } from "@/app/actions";
import { iso } from "@/lib/period";

export function LoanForm({ loan }: { loan?: Loan }) {
  const [f, setF] = useState({
    name: loan?.name ?? "",
    counterparty: loan?.counterparty ?? "",
    principal: loan ? (loan.principalCents / 100).toFixed(2).replace(".", ",") : "",
    interestRate: loan ? String(loan.interestRate).replace(".", ",") : "0",
    startDate: loan?.startDate ?? iso(new Date()),
    matchText: loan?.matchText ?? "",
    isLiability: loan?.isLiability ?? true,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveLoan({ id: loan?.id, ...f });
          setMsg(r.ok ? "Gespeichert." : r.error);
        });
      }}
    >
      <input className="input" placeholder="Name, z. B. Kredit Wilhelm-Blos 76" value={f.name} onChange={set("name")} />
      <input className="input" placeholder="Gläubiger / Schuldner" value={f.counterparty} onChange={set("counterparty")} />
      <div className="grid grid-cols-2 gap-2">
        <label className="label">Betrag<input className="input num mt-1" placeholder="100.000,00" value={f.principal} onChange={set("principal")} /></label>
        <label className="label">Zins %<input className="input num mt-1" value={f.interestRate} onChange={set("interestRate")} /></label>
      </div>
      <label className="label">Beginn<input type="date" className="input mt-1" value={f.startDate} onChange={set("startDate")} /></label>
      <label className="label">Suchtext für Zahlungen<input className="input mt-1" placeholder="Tilgung Wilhelm-Blos" value={f.matchText} onChange={set("matchText")} /></label>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={!f.isLiability} onChange={(e) => setF({ ...f, isLiability: !e.target.checked })} /> Ich habe Geld verliehen
      </label>
      <div className="flex items-center gap-2">
        <button className="btn btn-primary" disabled={pending}>{loan ? "Speichern" : "Anlegen"}</button>
        {loan && <button type="button" className="btn text-negative" disabled={pending} onClick={() => start(async () => { await deleteLoan(loan.id); })}>Löschen</button>}
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </form>
  );
}
