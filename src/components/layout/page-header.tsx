import { Suspense } from "react";
import { PeriodPicker } from "./period-picker";
import type { Period } from "@/lib/period";

export function PageHeader({
  title, subtitle, period, actions,
}: { title: string; subtitle?: React.ReactNode; period?: Period; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {period && (
          <Suspense>
            <PeriodPicker period={period} />
          </Suspense>
        )}
        {actions}
      </div>
    </header>
  );
}
