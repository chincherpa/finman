"use client";

import { useState, useTransition } from "react";
import { accountTypes, type Account, type AccountType } from "@/db/schema";
import { addSnapshot, saveAccount } from "@/app/actions";
import { iso } from "@/lib/period";

const labels: Record<AccountType, string> = {
  checking: "Girokonto", savings: "Sparkonto", cash: "Bargeld", depot: "Depot", loan: "Kreditkonto", asset: "Sachwert",
};

export function AccountForm({ account }: { account?: Account }) {
  const [f, setF] = useState({
    name: account?.name ?? "", type: account?.type ?? ("savings" as AccountType),
    accountNumber: account?.accountNumber ?? "", includeInNetWorth: account?.includeInNetWorth ?? true,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveAccount({ id: account?.id, ...f });
          setMsg(r.ok ? "Gespeichert." : r.error);
          if (r.ok && !account) setF({ ...f, name: "", accountNumber: "" });
        });
      }}
    >
      <input className="input" placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="flex gap-2">
        <select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as AccountType })}>
          {accountTypes.map((t) => <option key={t} value={t}>{labels[t]}</option>)}
        </select>
        <input className="input" placeholder="Kontonummer" value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={f.includeInNetWorth} onChange={(e) => setF({ ...f, includeInNetWorth: e.target.checked })} /> Im Vermögen zählen
      </label>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={pending}>{account ? "Speichern" : "Anlegen"}</button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </form>
  );
}

export function SnapshotForm({ accountId }: { accountId: number }) {
  const [date, setDate] = useState(iso(new Date()));
  const [balance, setBalance] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addSnapshot({ accountId, date, balance });
          setMsg(r.ok ? "Stand gespeichert." : r.error);
          if (r.ok) setBalance("");
        });
      }}
    >
      <span className="label">Kontostand erfassen</span>
      <div className="flex gap-2">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="input num" placeholder="1.234,56" value={balance} onChange={(e) => setBalance(e.target.value)} required />
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={pending}>Stand speichern</button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
      </div>
    </form>
  );
}
