const palette = [
  "#2b7de9", "#f0a020", "#16a34a", "#e8618c", "#8b5cf6", "#0ea5a4",
  "#f0612e", "#65a30d", "#c2410c", "#0369a1", "#a16207", "#be185d",
];

export const NEUTRAL = "#b9b5ac";

/** Stable color per label across pages (hash-based), uncategorized always grey. */
export function colorFor(label: string, index?: number): string {
  if (label === "Unkategorisiert" || label === "Andere") return NEUTRAL;
  if (index !== undefined) return palette[index % palette.length];
  let h = 0;
  for (const ch of label) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
