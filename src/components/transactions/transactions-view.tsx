"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, Clock, EyeOff, Filter, Plus, Search, Split as SplitIcon } from "lucide-react";
import clsx from "clsx";
import type { Account, Category } from "@/db/schema";
import type { TxRow, TxTab } from "@/lib/queries";
import { formatDate, formatEur } from "@/lib/format";
import { bulkUpdate } from "@/app/actions";
import { TxEditor } from "./tx-editor";
import { AddTransaction } from "./add-transaction";
import { CategoryInput } from "./category-input";
import { PayeeAvatar } from "./payee-avatar";
import { PayeeHistory } from "./payee-history";

const tabs: Array<{ id: TxTab; label: string }> = [
  { id: "all", label: "Alle" },
  { id: "review", label: "Zu prüfen" },
  { id: "uncategorized", label: "Ohne Kategorie" },
  { id: "split", label: "Aufgeteilt" },
  { id: "pending", label: "Vorgemerkt" },
  { id: "hidden", label: "Ausgeblendet" },
];

interface Props {
  result: { rows: TxRow[]; total: number; inCents: number; outCents: number; review: number };
  tab: TxTab;
  categories: Category[];
  payees: string[];
  accounts: Account[];
  groups: string[];
  /** Hide the tab switcher (review queue page). */
  lockTab?: boolean;
}

export function TransactionsView({ result, tab, categories, payees, accounts, groups, lockTab }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [openId, setOpenId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [adding, setAdding] = useState(false);
  const [historyPayee, setHistoryPayee] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k);
      else next.set(k, v);
    }
    router.replace(`${pathname}?${next}`);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) setParam({ q });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => setSelected(new Set()), [result]);

  const days = useMemo(() => {
    const m = new Map<string, TxRow[]>();
    for (const r of result.rows) {
      const list = m.get(r.bookingDate) ?? [];
      list.push(r);
      m.set(r.bookingDate, list);
    }
    return [...m.entries()];
  }, [result.rows]);

  const open = result.rows.find((r) => r.id === openId) ?? null;
  const openIndex = open ? result.rows.indexOf(open) : -1;
  const allSelected = result.rows.length > 0 && selected.size === result.rows.length;
  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const activeFilters = ["category", "kat0", "kat1", "month"].filter((k) => sp.get(k));
  const includePayees = sp.get("payee")?.split(",").filter(Boolean) ?? [];
  const excludePayees = sp.get("excludePayee")?.split(",").filter(Boolean) ?? [];
  const removeFromList = (key: string, value: string) => {
    const list = (sp.get(key) ?? "").split(",").filter((v) => v && v !== value);
    setParam({ [key]: list.length ? list.join(",") : null });
  };
  const selectedNames = useMemo(() => {
    const names = new Set<string>();
    for (const r of result.rows) {
      if (selected.has(r.id) && (r.payee ?? r.rawName)) names.add(r.payee ?? r.rawName);
    }
    return [...names];
  }, [result.rows, selected]);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="input pl-8"
              placeholder="Empfänger, Verwendungszweck, Kommentar, Kategorie oder Betrag suchen"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button className="btn" onClick={() => setAdding(true)}><Plus size={14} /> Umsatz</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={clsx("seg", lockTab && "hidden")}>
            {tabs.map((t) => (
              <button key={t.id} data-active={tab === t.id} onClick={() => setParam({ tab: t.id === "all" ? null : t.id })}>
                {t.label}
              </button>
            ))}
          </div>
          <select className="input w-auto" value={sp.get("type") ?? ""} onChange={(e) => setParam({ type: e.target.value })}>
            <option value="">Alle Arten</option>
            <option value="in">Eingänge</option>
            <option value="out">Ausgänge</option>
          </select>
          <select className="input w-auto" value={sp.get("account") ?? ""} onChange={(e) => setParam({ account: e.target.value })}>
            <option value="">Alle Konten</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <select className="input w-auto" value={sp.get("kat0") ?? ""} onChange={(e) => setParam({ kat0: e.target.value })}>
            <option value="">Alle Gruppen</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            <option value="Unkategorisiert">Unkategorisiert</option>
          </select>
          {activeFilters.map((k) => (
            <button key={k} className="btn bg-accent-soft text-accent" onClick={() => setParam({ [k]: null })}>
              {sp.get(k)} ×
            </button>
          ))}
          {includePayees.map((name) => (
            <button key={`payee-${name}`} className="btn bg-accent-soft text-accent" onClick={() => removeFromList("payee", name)}>
              {name} ×
            </button>
          ))}
          {excludePayees.map((name) => (
            <button key={`exclude-${name}`} className="btn bg-surface-2 text-muted" onClick={() => removeFromList("excludePayee", name)}>
              <EyeOff size={11} className="inline" /> {name} ×
            </button>
          ))}
        </div>
        <p className="num text-xs text-muted">
          {result.total} Umsätze · <span className="text-positive">{formatEur(result.inCents)} ein</span> ·{" "}
          {formatEur(result.outCents)} aus
          {result.review > 0 && <> · <span className="text-accent">{result.review} zu prüfen</span></>}
          {result.total > result.rows.length && <> · erste {result.rows.length} angezeigt</>}
        </p>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 border-b border-border bg-accent-soft/50 px-4 py-2 text-[13px]">
          <span className="font-medium">{selected.size} ausgewählt</span>
          <div className="w-72">
            <CategoryInput categories={categories} value={bulkCategory} onChange={setBulkCategory} placeholder="Kategorie setzen…" />
          </div>
          <button className="btn" disabled={!bulkCategory || pending}
            onClick={() => start(async () => { await bulkUpdate([...selected], { category: bulkCategory }); setBulkCategory(""); })}>
            Übernehmen
          </button>
          <button className="btn" disabled={pending} onClick={() => start(async () => { await bulkUpdate([...selected], { reviewed: true }); })}>
            Als geprüft markieren
          </button>
          <button className="btn" disabled={pending} onClick={() => start(async () => { await bulkUpdate([...selected], { hidden: tab !== "hidden" }); })}>
            {tab === "hidden" ? "Einblenden" : "Ausblenden"}
          </button>
          <button className="btn" disabled={pending} onClick={() => start(async () => { await bulkUpdate([...selected], { isTransfer: true }); })}>
            Als Umbuchung
          </button>
          <button className="btn" disabled={!selectedNames.length}
            onClick={() => setParam({ payee: selectedNames.join(","), excludePayee: null })}>
            <Filter size={14} /> Nur diese zeigen
          </button>
          <button className="btn" disabled={!selectedNames.length}
            onClick={() => setParam({ excludePayee: [...new Set([...excludePayees, ...selectedNames])].join(","), payee: null })}>
            <EyeOff size={14} /> Diese ausblenden
          </button>
          <button className="btn" disabled={selectedNames.length !== 1} title={selectedNames.length > 1 ? "Nur für einen Empfänger" : undefined}
            onClick={() => setHistoryPayee(selectedNames[0])}>
            <BarChart3 size={14} /> Verlauf
          </button>
        </div>
      )}

      <table className="w-full table-fixed text-[13.5px]">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="w-10 py-2 pl-4">
              <input type="checkbox" checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(result.rows.map((r) => r.id)))} />
            </th>
            <th className="w-[34%] py-2 font-medium">Empfänger</th>
            <th className="w-[24%] py-2 font-medium">Kategorie</th>
            <th className="py-2 font-medium">Kommentar</th>
            <th className="w-[11%] py-2 pr-4 text-right font-medium">Betrag</th>
          </tr>
        </thead>
        <tbody>
          {days.map(([day, rows]) => (
            <DayGroup key={day} day={day} rows={rows} selected={selected} toggle={toggle} onOpen={setOpenId} />
          ))}
          {result.rows.length === 0 && (
            <tr><td colSpan={5} className="py-16 text-center text-muted">
              Keine Umsätze im Zeitraum. CSV importieren oder Zeitraum ändern.
            </td></tr>
          )}
        </tbody>
      </table>

      {open && (
        <TxEditor
          key={open.id}
          tx={open}
          categories={categories}
          payees={payees}
          onClose={() => setOpenId(null)}
          onNext={openIndex < result.rows.length - 1 ? () => setOpenId(result.rows[openIndex + 1].id) : undefined}
          onPrev={openIndex > 0 ? () => setOpenId(result.rows[openIndex - 1].id) : undefined}
        />
      )}
      {adding && <AddTransaction accounts={accounts} categories={categories} payees={payees} onClose={() => setAdding(false)} />}
      {historyPayee && <PayeeHistory payee={historyPayee} onClose={() => setHistoryPayee(null)} />}
    </div>
  );
}

function DayGroup({ day, rows, selected, toggle, onOpen }: {
  day: string; rows: TxRow[]; selected: Set<number>; toggle: (id: number) => void; onOpen: (id: number) => void;
}) {
  const sum = rows.reduce((a, r) => a + r.amountCents, 0);
  return (
    <>
      <tr className="bg-surface-2 text-xs font-medium text-muted">
        <td colSpan={4} className="px-4 py-1.5">{formatDate(day)}</td>
        <td className="num px-4 py-1.5 text-right">{formatEur(sum)}</td>
      </tr>
      {rows.map((r) => (
        <tr key={r.id} className="cursor-pointer border-b border-border/70 hover:bg-surface-2/70" onClick={() => onOpen(r.id)}>
          <td className="py-2.5 pl-4" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
          </td>
          <td className="py-2.5 pr-3">
            <div className="flex items-center gap-2.5">
              {r.needsReview ? <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Zu prüfen" /> : <span className="size-1.5 shrink-0" />}
              <PayeeAvatar name={r.payee ?? r.rawName} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate font-medium">
                  {r.payee ?? <span className="text-muted">{r.rawName || r.bookingType}</span>}
                  {r.status === "pending" && <Clock size={12} className="text-muted" aria-label="Vorgemerkt" />}
                  {r.hidden && <EyeOff size={12} className="text-muted" />}
                </div>
                <div className="truncate text-xs text-muted">{r.purpose || r.rawName}</div>
              </div>
            </div>
          </td>
          <td className="py-2.5 pr-3">
            {r.isTransfer ? <span className="text-muted">Umbuchung</span>
              : r.splits.length ? (
                <span className="flex items-center gap-1.5">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted"><SplitIcon size={10} className="inline" /> Split</span>
                  <span className="truncate">{[...new Set(r.splits.map((s) => s.category ?? "?"))].join(", ")}</span>
                </span>
              ) : r.category ? (
                <div>
                  <div className="truncate">{r.category}</div>
                  <div className="truncate text-xs text-muted">{r.kat0} · {r.kat1}</div>
                </div>
              ) : <span className="text-accent">Unkategorisiert</span>}
          </td>
          <td className="truncate py-2.5 pr-3 text-muted">{r.comment}</td>
          <td className={clsx("num py-2.5 pr-4 text-right font-medium", r.amountCents > 0 && "text-positive")}>
            {formatEur(r.amountCents, { sign: true })}
          </td>
        </tr>
      ))}
    </>
  );
}
