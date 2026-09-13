"use client";

import { useMemo, useState } from "react";
import { ALL_EXERCISES } from "@/lib/trainingSplits";
import { RANK_TIERS } from "@/lib/rank";
import { scoreForLift, tierIndexForScore, weightForTierIndex } from "@/lib/muscleRank";

// Rank Calculator — lets a user plug in a hypothetical set (exercise,
// weight, reps) and their bodyweight, and see which strength tier that
// set's score would clear. Deliberately upfront that this only checks the
// SCORE gate: hitting the number is what starts the qualifying-days clock
// for that tier, not an instant rank-up on its own.
export default function RankCalculator({
  defaultBodyweightLb,
  onClose,
}: {
  defaultBodyweightLb: number | null;
  onClose: () => void;
}) {
  const [exerciseName, setExerciseName] = useState(ALL_EXERCISES[0]?.name ?? "");
  const [weight, setWeight] = useState("");
  const [bodyweight, setBodyweight] = useState(defaultBodyweightLb ? String(defaultBodyweightLb) : "");

  const exercise = ALL_EXERCISES.find((e) => e.name === exerciseName) ?? ALL_EXERCISES[0];

  const result = useMemo(() => {
    const w = Number(weight);
    const bw = Number(bodyweight);
    if (!exercise || !Number.isFinite(w) || w <= 0 || !Number.isFinite(bw) || bw <= 0) return null;
    const score = scoreForLift(exercise.kind, w, bw);
    const idx = tierIndexForScore(score);
    const nextIdx = idx + 1;
    const nextWeight = nextIdx < RANK_TIERS.length ? weightForTierIndex(nextIdx, exercise.kind, bw) : null;
    return {
      score,
      tier: RANK_TIERS[idx],
      nextTier: nextIdx < RANK_TIERS.length ? RANK_TIERS[nextIdx] : null,
      nextWeight,
    };
  }, [exercise, weight, bodyweight]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#1f1f23] bg-[#0d0d0f] p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#f4f4f5]">Rank Calculator</h2>
          <button onClick={onClose} className="text-sm text-[#71717a]">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-[#71717a]">
          See what strength tier a lift would clear. Hitting the number once opens the door — you still need
          consistent qualifying days to actually hold the rank.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">Exercise</label>
            <select
              value={exerciseName}
              onChange={(e) => setExerciseName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#27272a] bg-[#111113] px-2.5 py-2 text-sm text-[#f4f4f5] outline-none focus:border-emerald-500"
            >
              {ALL_EXERCISES.map((e) => (
                <option key={e.name} value={e.name}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">Weight (lb)</label>
              <input
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="185"
                className="mt-1 w-full rounded-lg border border-[#27272a] bg-[#111113] px-2.5 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">Bodyweight (lb)</label>
              <input
                type="number"
                inputMode="decimal"
                value={bodyweight}
                onChange={(e) => setBodyweight(e.target.value)}
                placeholder="170"
                className="mt-1 w-full rounded-lg border border-[#27272a] bg-[#111113] px-2.5 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {result && (
          <div className="mt-4 rounded-2xl border border-[#1f1f23] bg-[#111113] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#a1a1aa]">Strength tier reached</span>
              <span className="text-sm font-bold uppercase tracking-wide" style={{ color: result.tier.color ?? "#a1a1aa" }}>
                {result.tier.label}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#52525b]">Score: {result.score.toFixed(2)}</p>
            {result.nextTier && result.nextWeight !== null && (
              <p className="mt-2 text-xs text-[#71717a]">
                {Math.ceil(result.nextWeight)} lb would reach{" "}
                <span className="font-semibold" style={{ color: result.nextTier.color ?? "#a1a1aa" }}>
                  {result.nextTier.label}
                </span>
                &apos;s strength bar.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
