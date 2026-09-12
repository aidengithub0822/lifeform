export default function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";
  const dims = size === "lg" ? "h-20 w-20 text-2xl" : size === "sm" ? "h-9 w-9 text-xs" : "h-14 w-14 text-base";
  return (
    <div
      className={`flex ${dims} shrink-0 items-center justify-center rounded-full border-4 font-extrabold`}
      style={{ borderColor: color, color }}
    >
      {Math.round(score)}
    </div>
  );
}
