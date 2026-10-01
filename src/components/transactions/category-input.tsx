"use client";

import { useMemo, useRef, useState } from "react";
import type { Category } from "@/db/schema";

/** Searchable category picker over werte.csv entries; matches name and all three levels. */
export function CategoryInput({
  categories, value, onChange, placeholder = "Kategorie wählen…", suggestFor,
}: {
  categories: Category[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Payee name – categories starting with it are listed first. */
  suggestFor?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    const s = suggestFor?.toLowerCase().trim();
    const scored = categories
      .filter((c) => c.kat0)
      .map((c) => {
        const name = c.name.toLowerCase();
        let score = 0;
        if (s && (name === s || name.startsWith(`${s} `))) score += 100;
        if (q) {
          if (name.startsWith(q)) score += 50;
          else if (name.includes(q)) score += 30;
          else if (`${c.kat0} ${c.kat1} ${c.kat2}`.toLowerCase().includes(q)) score += 10;
          else return null;
        }
        return { c, score };
      })
      .filter((x): x is { c: Category; score: number } => !!x)
      .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name, "de"));
    return scored.slice(0, 60).map((x) => x.c);
  }, [categories, query, suggestFor]);

  const pick = (c: Category) => {
    onChange(c.name);
    setQuery("");
    setOpen(false);
    ref.current?.blur();
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        className="input"
        placeholder={placeholder}
        value={open ? query : value}
        onFocus={() => { setOpen(true); setQuery(""); setCursor(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, matches.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
          if (e.key === "Enter" && matches[cursor]) { e.preventDefault(); pick(matches[cursor]); }
          if (e.key === "Escape") { setOpen(false); ref.current?.blur(); }
        }}
      />
      {value && !open && (
        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted" onClick={() => onChange("")}>×</button>
      )}
      {open && (
        <ul className="card absolute z-30 mt-1 max-h-72 w-full overflow-auto py-1 shadow-lg">
          {matches.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                className={`flex w-full flex-col px-3 py-1.5 text-left ${i === cursor ? "bg-accent-soft" : "hover:bg-surface-2"}`}
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                onMouseEnter={() => setCursor(i)}
              >
                <span className="text-[13px]">{c.name}{c.fixed && <span className="ml-1.5 text-[10px] text-muted">FIX</span>}</span>
                <span className="text-[11px] text-muted">{c.kat0} · {c.kat1} · {c.kat2}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-2 text-xs text-muted">Keine Kategorie gefunden – in Einstellungen anlegen.</li>}
        </ul>
      )}
    </div>
  );
}
