import Link from "next/link";
import { formatEur, formatPercent } from "@/lib/format";

export interface BreakdownItem {
  key: string;
  sub?: string;
  cents: number;
  color: string;
  href?: string;
}

/** Ranked list with proportional bars (SharkFin style). */
export function BreakdownList({ items, total, max }: { items: BreakdownItem[]; total: number; max?: number }) {
  const top = Math.max(...items.map((i) => i.cents), 1);
  const shown = max ? items.slice(0, max) : items;
  return (
    <ul className="flex flex-col gap-3">
      {shown.map((i) => {
        const body = (
          <>
            <div className="flex items-baseline gap-2 text-[13.5px]">
              <span className="size-2 shrink-0 rounded-sm" style={{ background: i.color }} />
              <span className="truncate font-medium">{i.key}</span>
              {i.sub && <span className="truncate text-xs text-muted">· {i.sub}</span>}
              <span className="num ml-auto font-semibold">{formatEur(i.cents)}</span>
              <span className="num w-14 text-right text-xs text-muted">{formatPercent(i.cents, total)}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${Math.max((i.cents / top) * 100, 0.5)}%`, background: i.color }} />
            </div>
          </>
        );
        return (
          <li key={i.key}>
            {i.href ? <Link href={i.href} className="block rounded-md hover:opacity-80">{body}</Link> : body}
          </li>
        );
      })}
    </ul>
  );
}
