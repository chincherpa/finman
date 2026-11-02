"use client";

import { useMemo, useState } from "react";
import type { Category } from "@/db/schema";

export interface NewPayeeCategory {
  kat0: string;
  kat1: string;
  kat2: string;
  fixed: boolean;
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "de"));

/** Asks for kat0/kat1/kat2 of a payee that has no category entry yet. */
export function NewPayeeDialog({
  payee, categories, initial, pending, error, onSave, onSkip, onCancel,
}: {
  payee: string;
  categories: Category[];
  /** Currently selected category – its levels prefill the form. */
  initial?: Category;
  pending: boolean;
  error: string | null;
  onSave: (c: NewPayeeCategory) => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const [c, setC] = useState<NewPayeeCategory>({
    kat0: initial?.kat0 ?? "", kat1: initial?.kat1 ?? "", kat2: initial?.kat2 ?? "", fixed: initial?.fixed ?? false,
  });

  const levels = useMemo(() => {
    const cats = categories.filter((x) => x.kat0);
    const inK0 = cats.filter((x) => x.kat0 === c.kat0);
    const inK1 = inK0.filter((x) => x.kat1 === c.kat1);
    return {
      kat0: uniq(cats.map((x) => x.kat0)),
      kat1: uniq((inK0.length ? inK0 : cats).map((x) => x.kat1)),
      kat2: uniq((inK1.length ? inK1 : inK0.length ? inK0 : cats).map((x) => x.kat2)),
    };
  }, [categories, c.kat0, c.kat1]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={(e) => { e.stopPropagation(); onCancel(); }}>
      <form
        className="card w-[420px] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onCancel(); } }}
        onSubmit={(e) => { e.preventDefault(); onSave(c); }}
      >
        <h2 className="text-[15px] font-semibold">Neuer Empfänger</h2>
        <p className="mt-1 text-[13px] text-muted">„{payee}“ hat noch keine Kategorie. Zuordnung anlegen?</p>

        {(["kat0", "kat1", "kat2"] as const).map((k) => (
          <datalist key={k} id={`np-${k}`}>{levels[k].map((v) => <option key={v} value={v} />)}</datalist>
        ))}
        <div className="mt-4 flex flex-col gap-3">
          {(["kat0", "kat1", "kat2"] as const).map((k, i) => (
            <label key={k} className="label">
              Kategorie {i}{i === 0 && " *"}
              <input
                className="input mt-1" list={`np-${k}`} value={c[k]} autoFocus={i === 0} autoComplete="off"
                onChange={(e) => setC({ ...c, [k]: e.target.value })}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={c.fixed} onChange={(e) => setC({ ...c, fixed: e.target.checked })} /> Fixkosten
          </label>
        </div>

        {error && <p className="mt-3 text-[13px] text-negative">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button type="submit" className="btn btn-primary flex-1 justify-center" disabled={pending || !c.kat0.trim()}>Anlegen & speichern</button>
          <button type="button" className="btn" disabled={pending} onClick={onSkip}>Ohne</button>
          <button type="button" className="btn" disabled={pending} onClick={onCancel}>Abbrechen</button>
        </div>
      </form>
    </div>
  );
}
