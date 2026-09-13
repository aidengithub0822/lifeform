export default function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#eab308" : "#ef4444";
  const dims =
    size === "lg"
      ? "h-20 w-20 text-2xl border-4"
      : size === "sm"
        ? "h-8 w-8 text-[11px] border-2"
        : "h-14 w-14 text-base border-[3px]";
  return (
    <div
      className={`flex ${dims} tabular-nums shrink-0 items-center justify-center rounded-full font-bold`}
      style={{ borderColor: color, color }}
    >
      {Math.round(score)}
    </div>
  );
}
