import { countdownLabel } from "@/lib/pins";

// Small "Pinned" tag shown above a pinned community post. For a timed pin it
// also shows the time left ("Pinned · 4:32") and a lock, since the author
// can't delete the post until the timer ends.
export default function PinnedBadge({
  className,
  until,
  nowMs = 0,
}: {
  className?: string;
  until?: string | null;
  nowMs?: number;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 ${className ?? ""}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14 2l8 8-2.5 1-3.5 3.5.5 4.5-2 2-4-4-6 6-1-1 6-6-4-4 2-2 4.5.5L13 4.5 14 2z" />
      </svg>
      Pinned
      {until && nowMs > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{countdownLabel(until, nowMs)}</span>
        </>
      )}
    </span>
  );
}
