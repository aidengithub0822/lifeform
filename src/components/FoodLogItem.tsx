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
  onDeleted,
}: {
  id: string;
  foodName: string;
  calories: number;
  proteinG: number;
  score: number;
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

  if (confirming) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-900/50 bg-red-950/20 p-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-200">Delete &quot;{foodName}&quot;?</p>
          <p className="text-xs text-zinc-500">This can&apos;t be undone.</p>
        </div>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300"
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
    <div className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
      <ScoreBadge score={score} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{foodName}</p>
        <p className="text-xs text-zinc-500">
          {calories} calories · {Math.round(proteinG)}g protein
        </p>
      </div>
      <button
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${foodName}`}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-zinc-500 active:bg-zinc-800 active:text-red-400"
      >
        Remove
      </button>
    </div>
  );
}
