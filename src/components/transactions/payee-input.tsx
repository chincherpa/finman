"use client";

import { useMemo, useRef, useState } from "react";

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function editDistance(a: string, b: string) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function score(query: string, candidate: string) {
  if (!query) return 0;
  if (candidate === query) return 0;
  if (candidate.startsWith(query)) return 100 - Math.min(candidate.length - query.length, 50);
  if (candidate.includes(query)) return 70;
  const qt = query.split(" ");
  const ct = candidate.split(" ");
  let s = 0;
  for (const q of qt) {
    if (q.length < 2) continue;
    if (ct.some((c) => c === q)) s += 30;
    else if (ct.some((c) => c.startsWith(q) || (q.length >= 4 && q.startsWith(c) && c.length >= 4))) s += 20;
    else if (q.length >= 4 && ct.some((c) => c.length >= 4 && editDistance(q, c) <= (q.length >= 7 ? 2 : 1))) s += 15;
  }
  return s;
}

export function PayeeInput({
  payees, value, onChange,
}: {
  payees: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const ref = useRef<HTMLInputElement>(null);

  const normalized = useMemo(() => payees.map((p) => ({ p, n: norm(p) })), [payees]);

  const matches = useMemo(() => {
    const q = norm(value);
    if (!q) return [];
    return normalized
      .map(({ p, n }) => ({ p, s: score(q, n) }))
      .filter((x) => x.s >= 15)
      .sort((a, b) => b.s - a.s || a.p.localeCompare(b.p, "de"))
      .slice(0, 8)
      .map((x) => x.p);
  }, [normalized, value]);

  const pick = (p: string) => {
    onChange(p);
    setOpen(false);
    setCursor(-1);
  };

  return (
    <div className="relative">
      <input
        ref={ref}
        className="input mt-1"
        value={value}
        autoFocus
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setCursor(-1); }}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, matches.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, -1)); }
          if (e.key === "Enter" && cursor >= 0) { e.preventDefault(); e.stopPropagation(); pick(matches[cursor]); }
          if (e.key === "Escape") { e.stopPropagation(); setOpen(false); }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="card absolute z-30 mt-1 max-h-64 w-full overflow-auto py-1 shadow-lg">
          <li className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted">Ähnliche Empfänger</li>
          {matches.map((p, i) => (
            <li key={p}>
              <button
                type="button"
                className={`w-full px-3 py-1.5 text-left text-[13px] ${i === cursor ? "bg-accent-soft" : "hover:bg-surface-2"}`}
                onMouseDown={(e) => { e.preventDefault(); pick(p); }}
                onMouseEnter={() => setCursor(i)}
              >
                {p}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
