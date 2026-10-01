"use client";

import { useRouter } from "next/navigation";
import { StackedBars } from "@/components/charts/stacked-bars";

export function SpendingTrend(props: { data: Array<Record<string, number | string>>; series: Array<{ key: string; color: string }> }) {
  const router = useRouter();
  return <StackedBars {...props} onMonthClick={(m) => router.push(`/transactions?p=all&month=${m}&type=out`)} />;
}
