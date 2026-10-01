const palette = ["#f0612e", "#2b7de9", "#16a34a", "#d97706", "#db2777", "#7c3aed", "#0891b2", "#65a30d"];

export function PayeeAvatar({ name }: { name: string }) {
  const n = name.trim() || "?";
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = palette[h % palette.length];
  return (
    <span
      className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
      style={{ background: `${color}1f`, color }}
    >
      {n[0].toUpperCase()}
    </span>
  );
}
