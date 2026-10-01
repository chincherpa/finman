"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, Pencil, Trash2, Upload } from "lucide-react";
import type { Category, PayeeMapping, Rule } from "@/db/schema";
import {
  deleteCategory, deleteMapping, deleteRule, importLookupFile, reResolveAll, saveCategory, saveMapping, saveRule, type RuleInput,
} from "@/app/actions";

function useFilter<T>(rows: T[], text: (r: T) => string) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return s ? rows.filter((r) => text(r).toLowerCase().includes(s)) : rows;
  }, [rows, q, text]);
  return { q, setQ, filtered };
}

function Toolbar({ q, setQ, count, total, kind, children }: {
  q: string; setQ: (v: string) => void; count: number; total: number; kind?: "mappings" | "categories"; children?: React.ReactNode;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
      <input className="input max-w-sm" placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} />
      <span className="num text-xs text-muted">{count} von {total}</span>
      <div className="ml-auto flex items-center gap-2">
        {msg && <span className="text-xs text-muted">{msg}</span>}
        {kind && (
          <>
            <label className="btn cursor-pointer">
              <Upload size={14} /> {pending ? "Importiere…" : "CSV importieren"}
              <input type="file" accept=".csv" hidden onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const fd = new FormData();
                fd.set("file", file);
                e.target.value = "";
                start(async () => {
                  const r = await importLookupFile(kind, fd);
                  setMsg(r.ok ? `${r.data!.inserted} neu, ${r.data!.updated} aktualisiert` : r.error);
                });
              }} />
            </label>
            <a className="btn" href={`/api/export/${kind}`}><Download size={14} /> CSV</a>
          </>
        )}
        {children}
      </div>
    </div>
  );
}

const IconBtn = (p: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button type="button" className="rounded p-1 text-muted hover:bg-surface-2 hover:text-text" {...p} />
);

// ---------------------------------------------------------------- mappings

export function MappingsTable({ rows }: { rows: PayeeMapping[] }) {
  const { q, setQ, filtered } = useFilter(rows, (r) => `${r.rawName} ${r.payee} ${r.defaultComment}`);
  const [edit, setEdit] = useState<Partial<PayeeMapping> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = () => start(async () => {
    const r = await saveMapping({ id: edit?.id, rawName: edit?.rawName ?? "", payee: edit?.payee ?? "", defaultComment: edit?.defaultComment ?? "" });
    if (r.ok) { setEdit(null); setErr(null); } else setErr(r.error);
  });

  return (
    <div className="card overflow-hidden">
      <Toolbar q={q} setQ={setQ} count={filtered.length} total={rows.length} kind="mappings">
        <button className="btn btn-primary" onClick={() => setEdit({ rawName: "", payee: "", defaultComment: "" })}>+ Zuordnung</button>
      </Toolbar>
      {edit && (
        <form className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 border-b border-border bg-surface-2 p-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input className="input" placeholder="Original (Bank)" value={edit.rawName ?? ""} onChange={(e) => setEdit({ ...edit, rawName: e.target.value })} autoFocus />
          <input className="input" placeholder="Empfänger" value={edit.payee ?? ""} onChange={(e) => setEdit({ ...edit, payee: e.target.value })} />
          <input className="input" placeholder="Standard-Kommentar" value={edit.defaultComment ?? ""} onChange={(e) => setEdit({ ...edit, defaultComment: e.target.value })} />
          <div className="flex gap-2"><button className="btn btn-primary" disabled={pending}>Speichern</button><button type="button" className="btn" onClick={() => setEdit(null)}>Abbrechen</button></div>
          {err && <p className="col-span-4 text-xs text-negative">{err}</p>}
        </form>
      )}
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-border text-left text-xs text-muted">
          <th className="px-4 py-2 font-medium">Original (Bank)</th><th className="py-2 font-medium">Empfänger</th><th className="py-2 font-medium">Standard-Kommentar</th><th className="w-20" />
        </tr></thead>
        <tbody>
          {filtered.slice(0, 500).map((r) => (
            <tr key={r.id} className="border-b border-border/70 hover:bg-surface-2/60">
              <td className="px-4 py-1.5">{r.rawName}</td><td className="py-1.5 font-medium">{r.payee}</td><td className="py-1.5 text-muted">{r.defaultComment}</td>
              <td className="pr-3 text-right">
                <IconBtn onClick={() => setEdit(r)} aria-label="Bearbeiten"><Pencil size={13} /></IconBtn>
                <IconBtn onClick={() => start(async () => { await deleteMapping(r.id); })} aria-label="Löschen"><Trash2 size={13} /></IconBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- categories (werte)

export function CategoriesTable({ rows }: { rows: Category[] }) {
  const { q, setQ, filtered } = useFilter(rows, (r) => `${r.name} ${r.kat0} ${r.kat1} ${r.kat2}`);
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const levels = useMemo(() => ({
    kat0: [...new Set(rows.map((r) => r.kat0))].filter(Boolean).sort(),
    kat1: [...new Set(rows.map((r) => r.kat1))].filter(Boolean).sort(),
    kat2: [...new Set(rows.map((r) => r.kat2))].filter(Boolean).sort(),
  }), [rows]);

  const submit = () => start(async () => {
    const r = await saveCategory({ id: edit?.id, name: edit?.name ?? "", kat0: edit?.kat0 ?? "", kat1: edit?.kat1 ?? "", kat2: edit?.kat2 ?? "", fixed: !!edit?.fixed });
    if (r.ok) { setEdit(null); setErr(null); } else setErr(r.error);
  });

  return (
    <div className="card overflow-hidden">
      <Toolbar q={q} setQ={setQ} count={filtered.length} total={rows.length} kind="categories">
        <button className="btn btn-primary" onClick={() => setEdit({ name: "", kat0: "", kat1: "", kat2: "", fixed: false })}>+ Kategorie</button>
      </Toolbar>
      {(["kat0", "kat1", "kat2"] as const).map((k) => (
        <datalist key={k} id={`dl-${k}`}>{levels[k].map((v) => <option key={v} value={v} />)}</datalist>
      ))}
      {edit && (
        <form className="grid grid-cols-[2fr_1fr_1fr_1fr_auto_auto] items-center gap-2 border-b border-border bg-surface-2 p-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input className="input" placeholder="Name (Empfänger [+ Zusatz])" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
          {(["kat0", "kat1", "kat2"] as const).map((k, i) => (
            <input key={k} className="input" list={`dl-${k}`} placeholder={`Kategorie ${i}`} value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
          ))}
          <label className="flex items-center gap-1 text-[13px]"><input type="checkbox" checked={!!edit.fixed} onChange={(e) => setEdit({ ...edit, fixed: e.target.checked })} /> Fix</label>
          <div className="flex gap-2"><button className="btn btn-primary" disabled={pending}>Speichern</button><button type="button" className="btn" onClick={() => setEdit(null)}>Abbrechen</button></div>
          {err && <p className="col-span-6 text-xs text-negative">{err}</p>}
        </form>
      )}
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-border text-left text-xs text-muted">
          <th className="px-4 py-2 font-medium">Name</th><th className="py-2 font-medium">Kategorie 0</th><th className="py-2 font-medium">Kategorie 1</th>
          <th className="py-2 font-medium">Kategorie 2</th><th className="py-2 font-medium">Fix</th><th className="w-20" />
        </tr></thead>
        <tbody>
          {filtered.slice(0, 600).map((r) => (
            <tr key={r.id} className="border-b border-border/70 hover:bg-surface-2/60">
              <td className="px-4 py-1.5 font-medium">{r.name}</td>
              <td className={`py-1.5 ${r.kat0 ? "" : "text-accent"}`}>{r.kat0 || "fehlt"}</td>
              <td className="py-1.5">{r.kat1}</td><td className="py-1.5 text-muted">{r.kat2}</td><td className="py-1.5">{r.fixed ? "ja" : ""}</td>
              <td className="pr-3 text-right">
                <IconBtn onClick={() => setEdit(r)} aria-label="Bearbeiten"><Pencil size={13} /></IconBtn>
                <IconBtn onClick={() => start(async () => { await deleteCategory(r.id); })} aria-label="Löschen"><Trash2 size={13} /></IconBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- rules

const fieldLabels: Record<Rule["field"], string> = {
  raw_name: "Empfänger (Bank)", purpose: "Verwendungszweck", iban: "IBAN", payee: "Empfänger (zugeordnet)", booking_type: "Buchungsart",
};
const opLabels: Record<Rule["op"], string> = { contains: "enthält", equals: "ist", regex: "Regex" };

const emptyRule: RuleInput = {
  name: "", priority: 100, field: "purpose", op: "contains", value: "", field2: null, op2: "contains", value2: null,
  amountMinCents: null, amountMaxCents: null, setPayee: "", setCategory: "", setComment: "", setTransfer: null, active: true,
};

export function RulesTable({ rows, categories }: { rows: Rule[]; categories: string[] }) {
  const { q, setQ, filtered } = useFilter(rows, (r) => `${r.name} ${r.value} ${r.value2 ?? ""} ${r.setPayee ?? ""} ${r.setCategory ?? ""}`);
  const [edit, setEdit] = useState<RuleInput | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<RuleInput>) => setEdit((e) => (e ? { ...e, ...patch } : e));

  const submit = () => start(async () => {
    if (!edit) return;
    const r = await saveRule({
      ...edit,
      field2: edit.value2 ? edit.field2 ?? "purpose" : null,
      setPayee: edit.setPayee || null, setCategory: edit.setCategory || null, setComment: edit.setComment || null,
    });
    if (r.ok) { setEdit(null); setMsg(`Gespeichert, ${r.data} Umsätze neu zugeordnet.`); } else setMsg(r.error);
  });

  const cond = (field: Rule["field"] | null | undefined, op: Rule["op"] | null | undefined, value: string | null | undefined) =>
    value ? `${fieldLabels[field ?? "purpose"]} ${opLabels[op ?? "contains"]} „${value}“` : null;

  return (
    <div className="card overflow-hidden">
      <Toolbar q={q} setQ={setQ} count={filtered.length} total={rows.length}>
        {msg && <span className="text-xs text-muted">{msg}</span>}
        <button className="btn btn-primary" onClick={() => setEdit({ ...emptyRule })}>+ Regel</button>
      </Toolbar>
      <datalist id="dl-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      {edit && (
        <form className="flex flex-col gap-2 border-b border-border bg-surface-2 p-4 text-[13px]" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="grid grid-cols-[2fr_100px] gap-2">
            <input className="input" placeholder="Name der Regel" value={edit.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
            <input className="input num" type="number" title="Priorität (kleiner = zuerst)" value={edit.priority ?? 100} onChange={(e) => set({ priority: Number(e.target.value) })} />
          </div>
          {([["field", "op", "value"], ["field2", "op2", "value2"]] as const).map(([f, o, v], i) => (
            <div key={f} className="grid grid-cols-[30px_180px_110px_1fr] items-center gap-2">
              <span className="text-xs text-muted">{i === 0 ? "Wenn" : "und"}</span>
              <select className="input" value={(edit[f] as string) ?? "purpose"} onChange={(e) => set({ [f]: e.target.value })}>
                {Object.entries(fieldLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select className="input" value={(edit[o] as string) ?? "contains"} onChange={(e) => set({ [o]: e.target.value })}>
                {Object.entries(opLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input className="input" placeholder={i === 0 ? "z. B. Spotify" : "optional"} value={(edit[v] as string) ?? ""} onChange={(e) => set({ [v]: e.target.value })} />
            </div>
          ))}
          <div className="grid grid-cols-[30px_1fr_1fr] items-center gap-2">
            <span className="text-xs text-muted">€</span>
            <input className="input num" placeholder="Betrag ab (optional)" value={edit.amountMinCents != null ? edit.amountMinCents / 100 : ""}
              onChange={(e) => set({ amountMinCents: e.target.value ? Math.round(Number(e.target.value.replace(",", ".")) * 100) : null })} />
            <input className="input num" placeholder="Betrag bis (optional)" value={edit.amountMaxCents != null ? edit.amountMaxCents / 100 : ""}
              onChange={(e) => set({ amountMaxCents: e.target.value ? Math.round(Number(e.target.value.replace(",", ".")) * 100) : null })} />
          </div>
          <div className="grid grid-cols-[30px_1fr_1fr_1fr] items-center gap-2">
            <span className="text-xs text-muted">dann</span>
            <input className="input" placeholder="Empfänger setzen" value={edit.setPayee ?? ""} onChange={(e) => set({ setPayee: e.target.value })} />
            <input className="input" list="dl-cats" placeholder="Kategorie setzen" value={edit.setCategory ?? ""} onChange={(e) => set({ setCategory: e.target.value })} />
            <input className="input" placeholder="Kommentar setzen" value={edit.setComment ?? ""} onChange={(e) => set({ setComment: e.target.value })} />
          </div>
          <div className="flex items-center gap-4 pl-[38px]">
            <label className="flex items-center gap-1"><input type="checkbox" checked={!!edit.setTransfer} onChange={(e) => set({ setTransfer: e.target.checked || null })} /> Als Umbuchung</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => set({ active: e.target.checked })} /> Aktiv</label>
            <div className="ml-auto flex gap-2"><button className="btn btn-primary" disabled={pending}>Speichern</button><button type="button" className="btn" onClick={() => setEdit(null)}>Abbrechen</button></div>
          </div>
        </form>
      )}
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-border text-left text-xs text-muted">
          <th className="px-4 py-2 font-medium">Prio</th><th className="py-2 font-medium">Bedingung</th><th className="py-2 font-medium">Aktion</th><th className="w-20" />
        </tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} className={`border-b border-border/70 hover:bg-surface-2/60 ${r.active ? "" : "opacity-50"}`}>
              <td className="num px-4 py-2 text-muted">{r.priority}</td>
              <td className="py-2">
                {r.name && <div className="font-medium">{r.name}</div>}
                <div className="text-muted">
                  {[cond(r.field, r.op, r.value), cond(r.field2, r.op2, r.value2)].filter(Boolean).join(" und ")}
                  {(r.amountMinCents != null || r.amountMaxCents != null) && ` · Betrag ${r.amountMinCents != null ? `≥ ${r.amountMinCents / 100}` : ""} ${r.amountMaxCents != null ? `≤ ${r.amountMaxCents / 100}` : ""}`}
                </div>
              </td>
              <td className="py-2">
                {[r.setPayee && `Empfänger „${r.setPayee}“`, r.setCategory && `Kategorie „${r.setCategory}“`, r.setComment && `Kommentar „${r.setComment}“`, r.setTransfer && "Umbuchung"]
                  .filter(Boolean).join(" · ")}
              </td>
              <td className="pr-3 text-right">
                <IconBtn onClick={() => setEdit({ ...r })} aria-label="Bearbeiten"><Pencil size={13} /></IconBtn>
                <IconBtn onClick={() => start(async () => { await deleteRule(r.id); })} aria-label="Löschen"><Trash2 size={13} /></IconBtn>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- data

export function DataPanel() {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card flex flex-col gap-4 p-5 text-[13.5px]">
      <div>
        <h2 className="font-semibold">Zuordnung neu berechnen</h2>
        <p className="mb-2 text-muted">Wendet Zuordnungen, Regeln und Kategorien erneut auf alle Umsätze an. Manuell bearbeitete Umsätze bleiben unverändert.</p>
        <button className="btn" disabled={pending} onClick={() => start(async () => {
          const r = await reResolveAll();
          setMsg(r.ok ? `${r.data} Umsätze aktualisiert.` : r.error);
        })}>Neu berechnen</button>
      </div>
      <div>
        <h2 className="font-semibold">Sicherung</h2>
        <p className="mb-2 text-muted">Lädt die komplette SQLite-Datenbank herunter.</p>
        <a className="btn" href="/api/backup"><Download size={14} /> Datenbank sichern</a>
      </div>
      {msg && <p className="text-positive">{msg}</p>}
    </div>
  );
}
