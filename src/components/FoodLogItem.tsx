"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ScoreBadge from "@/components/ScoreBadge";

// A single food-log row with a delete action. Logs previously had no way
// to be removed at all — a mis-dated or duplicate entry (see the
// backdating feature on /scan) was permanent. Used on both Home's "Today"
// list and the full /scan/history view.
export default function FoodLogItem({
  id,
  foodName,
  calories,
  proteinG,
  score,
  loggedAt,
  onDeleted,
}: {
  id: string;
  foodName: string;
  calories: number;
  proteinG: number;
  score: number;
  loggedAt?: string;
  onDeleted?: (id: string) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const { error } = await supabase.from("food_logs").delete().eq("id", id);
    setDeleting(false);
    if (error) {
      // Rare (RLS should always allow deleting your own row) — leave the
      // confirm state up so the error is visible instead of silently
      // reverting to looking like nothing happened.
      alert(`Couldn't delete: ${error.message}`);
      return;
    }
    setConfirming(false);
    onDeleted?.(id);
    router.refresh();
  }

  const time = loggedAt
    ? new Date(loggedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null;

  if (confirming) {
    return (
      <div className="flex items-center gap-3 border-b border-[#1a1a1d] py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[#f4f4f5]">Delete &quot;{foodName}&quot;?</p>
          <p className="text-xs text-[#71717a]">This can&apos;t be undone.</p>
        </div>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded-lg bg-[#18181b] px-3 py-1.5 text-xs font-medium text-[#d4d4d8]"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {deleting ? "..." : "Delete"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-[#1a1a1d] py-3">
      {time && <span className="w-11 shrink-0 text-[11px] tabular-nums text-[#52525b]">{time}</span>}
      <ScoreBadge score={score} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#f4f4f5]">{foodName}</p>
        <p className="mt-0.5 text-xs tabular-nums text-[#71717a]">
          {calories} cal · {Math.round(proteinG)}g protein
        </p>
      </div>
      <button
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${foodName}`}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[#52525b] active:text-red-400"
      >
        Remove
      </button>
    </div>
  );
}
