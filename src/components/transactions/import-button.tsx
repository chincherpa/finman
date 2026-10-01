"use client";

import { useRef, useState, useTransition } from "react";
import { Upload, X } from "lucide-react";
import { importFiles, previewImportFiles } from "@/app/actions";
import type { ImportSummary } from "@/lib/import/importer";
import { formatEur } from "@/lib/format";

type Result = { file: string; summary?: ImportSummary; error?: string };

export function ImportButton() {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<Result[] | null>(null);
  const [formData, setFormData] = useState<FormData | null>(null);
  const [done, setDone] = useState<Result[] | null>(null);
  const [drag, setDrag] = useState(false);

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    start(async () => {
      const r = await previewImportFiles(fd);
      if (r.ok) {
        setFormData(fd);
        setPreview(r.data ?? []);
      }
    });
  };

  const confirm = () => {
    if (!formData) return;
    start(async () => {
      const r = await importFiles(formData);
      setPreview(null);
      setFormData(null);
      if (r.ok) setDone(r.data ?? []);
    });
  };

  const cancel = () => {
    setPreview(null);
    setFormData(null);
  };

  return (
    <>
      <button
        className={`btn btn-primary ${drag ? "ring-4 ring-accent-soft" : ""}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        disabled={pending}
        title="CSV-Export der Bank wählen oder hierher ziehen"
      >
        <Upload size={14} /> {pending ? "Importiere…" : "CSV importieren"}
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20" onClick={cancel}>
          <div className="card max-h-[80vh] w-[560px] overflow-y-auto p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Vorschau</h2>
              <button onClick={cancel} aria-label="Schließen"><X size={16} /></button>
            </div>
            {preview.map((r) => (
              <div key={r.file} className="mb-4 text-sm">
                <div className="mb-1 truncate font-medium">{r.file}</div>
                {r.error ? (
                  <p className="text-negative">{r.error}</p>
                ) : r.summary && (
                  <>
                    <dl className="num mb-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px]">
                      <dt className="text-muted">Neu</dt><dd>{r.summary.inserted}</dd>
                      <dt className="text-muted">Schon vorhanden</dt><dd>{r.summary.duplicates}</dd>
                      <dt className="text-muted">Vormerkungen ersetzt</dt><dd>{r.summary.replacedPending}</dd>
                      <dt className="text-muted">Vormerkungen entfernt</dt><dd>{r.summary.removedPending}</dd>
                    </dl>
                    {r.summary.rows.length > 0 && (
                      <ul className="num divide-y divide-border rounded border border-border">
                        {r.summary.rows.map((row, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 px-2 py-1">
                            <span className="truncate text-muted">{row.bookingDate}</span>
                            <span className="truncate">{row.payee ?? row.rawName}</span>
                            {row.needsReview && <span className="shrink-0 text-accent">zu prüfen</span>}
                            <span className="shrink-0">{formatEur(row.amountCents, { sign: true })}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            ))}
            <div className="flex gap-2">
              <button className="btn flex-1 justify-center" onClick={cancel} disabled={pending}>Abbrechen</button>
              <button className="btn btn-primary flex-1 justify-center" onClick={confirm} disabled={pending}>
                {pending ? "Importiere…" : "Import bestätigen"}
              </button>
            </div>
          </div>
        </div>
      )}
      {done && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20" onClick={() => setDone(null)}>
          <div className="card w-[440px] p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Import abgeschlossen</h2>
              <button onClick={() => setDone(null)} aria-label="Schließen"><X size={16} /></button>
            </div>
            {done.map((r) => (
              <div key={r.file} className="mb-3 text-sm">
                <div className="mb-1 truncate font-medium">{r.file}</div>
                {r.error ? (
                  <p className="text-negative">{r.error}</p>
                ) : r.summary && (
                  <dl className="num grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px]">
                    <dt className="text-muted">Zeilen gelesen</dt><dd>{r.summary.rowsRead}</dd>
                    <dt className="text-muted">Neu</dt><dd>{r.summary.inserted}</dd>
                    <dt className="text-muted">Schon vorhanden</dt><dd>{r.summary.duplicates}</dd>
                    <dt className="text-muted">Vormerkungen ersetzt</dt><dd>{r.summary.replacedPending}</dd>
                    <dt className="text-muted">Vormerkungen entfernt</dt><dd>{r.summary.removedPending}</dd>
                    <dt className="text-muted">Kontostände</dt><dd>{r.summary.balanceSnapshots}</dd>
                    <dt className="text-muted">Zu prüfen</dt><dd className="font-semibold text-accent">{r.summary.needsReview}</dd>
                  </dl>
                )}
              </div>
            ))}
            <button className="btn w-full justify-center" onClick={() => setDone(null)}>OK</button>
          </div>
        </div>
      )}
    </>
  );
}
