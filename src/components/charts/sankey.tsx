"use client";

import ReactECharts from "echarts-for-react";
import { formatEur } from "@/lib/format";

export interface SankeyNode {
  name: string; // unique id
  label: string;
  color: string;
  depth?: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number; // cents
}

export function Sankey({ nodes, links, height = 460 }: { nodes: SankeyNode[]; links: SankeyLink[]; height?: number }) {
  // Node value = max(in, out)
  const inSum = new Map<string, number>();
  const outSum = new Map<string, number>();
  for (const l of links) {
    inSum.set(l.target, (inSum.get(l.target) ?? 0) + l.value);
    outSum.set(l.source, (outSum.get(l.source) ?? 0) + l.value);
  }
  const value = (n: string) => Math.max(inSum.get(n) ?? 0, outSum.get(n) ?? 0);
  const byName = new Map(nodes.map((n) => [n.name, n]));

  const option = {
    tooltip: {
      trigger: "item",
      formatter: (p: { dataType: string; data: { source?: string; target?: string; value?: number; name?: string } }) => {
        if (p.dataType === "edge") {
          return `${byName.get(p.data.source!)?.label} → ${byName.get(p.data.target!)?.label}<br/><b>${formatEur(p.data.value!)}</b>`;
        }
        return `${byName.get(p.data.name!)?.label}<br/><b>${formatEur(value(p.data.name!))}</b>`;
      },
    },
    series: [
      {
        type: "sankey",
        left: 140,
        right: 170,
        top: 10,
        bottom: 10,
        nodeWidth: 10,
        nodeGap: 18,
        layoutIterations: 64,
        nodeAlign: "justify",
        emphasis: { focus: "adjacency" },
        data: nodes.map((n) => ({ name: n.name, depth: n.depth, itemStyle: { color: n.color, borderWidth: 0 } })),
        links: links.filter((l) => l.value > 0),
        lineStyle: { color: "gradient", opacity: 0.32, curveness: 0.5 },
        label: {
          fontSize: 11.5,
          color: "#1c1b19",
          formatter: (p: { name: string }) =>
            `{b|${byName.get(p.name)?.label ?? p.name}}\n{v|${formatEur(value(p.name), { short: true })}}`,
          rich: { b: { fontWeight: 600, fontSize: 11.5 }, v: { color: "#77746d", fontSize: 10.5 } },
        },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />;
}
