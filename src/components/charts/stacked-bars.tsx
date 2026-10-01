"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEur } from "@/lib/format";

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });

export function StackedBars({
  data, series, onMonthClick, height = 280,
}: {
  data: Array<Record<string, number | string>>;
  series: Array<{ key: string; color: string }>;
  onMonthClick?: (month: string) => void;
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
          onClick={(e) => {
            const label = (e as { activeLabel?: string } | null)?.activeLabel;
            if (label && onMonthClick) onMonthClick(String(label));
          }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatEur(Number(v), { short: true })} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={70} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            labelFormatter={(l) => monthLabel(String(l))}
            formatter={(v, name) => [formatEur(Number(v)), name]}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} isAnimationActive={false} cursor={onMonthClick ? "pointer" : undefined} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
