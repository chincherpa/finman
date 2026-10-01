"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatEur } from "@/lib/format";

export function Donut({ data, total }: { data: Array<{ key: string; cents: number; color: string }>; total: number }) {
  return (
    <div className="relative h-60 w-60">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="cents" nameKey="key" innerRadius="66%" outerRadius="100%" paddingAngle={1.5} stroke="none" isAnimationActive={false}>
            {data.map((d) => <Cell key={d.key} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v) => formatEur(Number(v))} contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-xs text-muted">Gesamt</div>
          <div className="num text-xl font-semibold">{formatEur(total, { short: true })}</div>
        </div>
      </div>
    </div>
  );
}
