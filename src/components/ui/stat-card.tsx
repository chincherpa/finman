import Link from "next/link";

export function StatCard({ label, value, hint, dot }: { label: string; value: React.ReactNode; hint?: React.ReactNode; dot?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {dot && <span className="size-2 rounded-sm" style={{ background: dot }} />}
        {label}
      </div>
      <div className="num mt-1 truncate text-[22px] font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Seg({ options, value, hrefFor }: { options: Array<{ id: string; label: string }>; value: string; hrefFor: (id: string) => string }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <Link key={o.id} href={hrefFor(o.id)} data-active={o.id === value} scroll={false}>{o.label}</Link>
      ))}
    </div>
  );
}
