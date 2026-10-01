"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatEur } from "@/lib/format";

const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString("de-DE", { month: "short", year: "2-digit" });

export function NetWorthChart({ data }: { data: Array<{ month: string; value: number }> }) {
  return (
    <div className="h-72">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f0612e" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#f0612e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={(v) => formatEur(Number(v), { short: true })} tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} width={80} domain={["auto", "auto"]} />
          <Tooltip labelFormatter={(l) => monthLabel(String(l))} formatter={(v) => [formatEur(Number(v)), "Vermögen"]}
            contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid var(--border)" }} />
          <Area type="monotone" dataKey="value" stroke="#f0612e" strokeWidth={2} fill="url(#nw)" dot={{ r: 3, fill: "#f0612e" }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
