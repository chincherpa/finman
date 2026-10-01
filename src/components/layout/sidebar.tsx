"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowDownUp, CircleHelp, HandCoins, Landmark, PieChart, ReceiptText, Settings, TrendingUp, Wallet,
} from "lucide-react";
import clsx from "clsx";

const items = [
  { href: "/transactions", label: "Umsätze", icon: ReceiptText, badge: "review" },
  { href: "/cash-flow", label: "Cashflow", icon: ArrowDownUp },
  { href: "/spending", label: "Ausgaben", icon: PieChart },
  { href: "/net-worth", label: "Vermögen", icon: TrendingUp },
  { href: "/accounts", label: "Konten", icon: Landmark },
  { href: "/loans", label: "Kredite", icon: HandCoins },
  { href: "/uncategorized", label: "Zu prüfen", icon: CircleHelp, badge: "uncategorized" },
] as const;

export function Sidebar({ review, uncategorized }: { review: number; uncategorized: number }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  // Keep the selected period when switching pages.
  const keep = new URLSearchParams();
  for (const k of ["p", "from", "to"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString() ? `?${keep}` : "";
  const badges = { review, uncategorized };

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface-2 px-3 py-5">
      <Link href={`/transactions${qs}`} className="mb-6 flex items-center gap-2 px-2 text-[15px] font-semibold">
        <span className="grid size-7 place-items-center rounded-lg bg-accent text-white"><Wallet size={16} /></span>
        Finanzen
      </Link>
      <nav className="flex flex-col gap-0.5">
        {items.map((it) => {
          const active = pathname.startsWith(it.href);
          const count = "badge" in it ? badges[it.badge] : 0;
          return (
            <Link
              key={it.href}
              href={`${it.href}${qs}`}
              className={clsx(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors",
                active ? "bg-accent-soft font-medium text-accent" : "text-text/80 hover:bg-black/[0.04]",
              )}
            >
              <it.icon size={16} strokeWidth={1.8} />
              <span className="flex-1">{it.label}</span>
              {count > 0 && (
                <span className="num rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold text-accent">{count}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto">
        <Link
          href="/settings"
          className={clsx(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px]",
            pathname.startsWith("/settings") ? "bg-accent-soft font-medium text-accent" : "text-text/80 hover:bg-black/[0.04]",
          )}
        >
          <Settings size={16} strokeWidth={1.8} /> Einstellungen
        </Link>
      </div>
    </aside>
  );
}
