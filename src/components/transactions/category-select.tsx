"use client";

import { useEffect, useMemo, useState } from "react";
import type { Category } from "@/db/schema";

const NONE = "__none__";

/** Three cascading selects (kat0 → kat1 → kat2); value is the category name. */
export function CategorySelect({
  categories, value, onChange,
}: {
  categories: Category[];
  value: string;
  onChange: (v: string) => void;
}) {
  const cats = useMemo(() => categories.filter((c) => c.kat0), [categories]);
  const current = cats.find((c) => c.name === value);
  const [k0, setK0] = useState(current?.kat0 ?? "");
  const [k1, setK1] = useState(current ? current.kat1 || NONE : "");

  useEffect(() => {
    if (current) {
      setK0(current.kat0);
      setK1(current.kat1 || NONE);
    } else if (!value) {
      setK0("");
      setK1("");
    }
  }, [current, value]);

  const kat0s = useMemo(() => [...new Set(cats.map((c) => c.kat0))].sort((a, b) => a.localeCompare(b, "de")), [cats]);
  const inK0 = useMemo(() => cats.filter((c) => c.kat0 === k0), [cats, k0]);
  const kat1s = useMemo(
    () => [...new Set(inK0.map((c) => c.kat1 || NONE))].sort((a, b) => (a === NONE ? -1 : b === NONE ? 1 : a.localeCompare(b, "de"))),
    [inK0],
  );
  const inK1 = useMemo(() => inK0.filter((c) => (c.kat1 || NONE) === k1), [inK0, k1]);

  const pickOrClear = (candidates: Category[]) => onChange(candidates.length === 1 ? candidates[0].name : "");

  const label2 = (c: Category) => {
    const base = c.kat2 || "–";
    const dupes = inK1.filter((x) => (x.kat2 || "–") === base).length > 1;
    return dupes ? `${base} (${c.name})` : base;
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        className="input"
        value={k0}
        onChange={(e) => {
          setK0(e.target.value);
          setK1("");
          pickOrClear(cats.filter((c) => c.kat0 === e.target.value));
        }}
      >
        <option value="">Kategorie 0…</option>
        {kat0s.map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <select
        className="input"
        value={k1}
        disabled={!k0}
        onChange={(e) => {
          setK1(e.target.value);
          pickOrClear(inK0.filter((c) => (c.kat1 || NONE) === e.target.value));
        }}
      >
        <option value="">Kategorie 1…</option>
        {kat1s.map((k) => <option key={k} value={k}>{k === NONE ? "–" : k}</option>)}
      </select>
      <select
        className="input"
        value={current && inK1.includes(current) ? current.name : ""}
        disabled={!k1}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Kategorie 2…</option>
        {inK1.map((c) => <option key={c.id} value={c.name}>{label2(c)}</option>)}
      </select>
    </div>
  );
}
