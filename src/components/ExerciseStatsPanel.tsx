"use client";

import { MUSCLE_LABELS, type MuscleGroup } from "@/lib/trainingSplits";
import { rankMeta, type RankTier } from "@/lib/rank";

export interface MuscleStatsRow {
  muscle: MuscleGroup;
  tier: RankTier;
  bestLift: { name: string; weight_lb: number; reps: number } | null;
  totalSetsLogged: number;
}

// Exercise Stats — a read-only summary built entirely from the muscle-rank
// data the Fitness page already fetched (no extra round trip): total sets
// logged across every tracked muscle, plus a per-muscle PR list sorted
// strongest-tier-first so the best lifts surface at the top.
export default function ExerciseStatsPanel({ rows, onClose }: { rows: MuscleStatsRow[]; onClose: () => void }) {
  const totalSets = rows.reduce((sum, r) => sum + r.totalSetsLogged, 0);
  const TIER_ORDER: RankTier[] = ["newbie", "bronze", "silver", "gold", "platinum", "diamond", "champion", "grand_champion", "titan"];
  const sorted = [...rows].sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#1f1f23] bg-[#0d0d0f] p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#f4f4f5]">Exercise Stats</h2>
          <button onClick={onClose} className="text-sm text-[#71717a]">
            Close
          </button>
        </div>

        <div className="mt-3 rounded-2xl border border-[#1f1f23] bg-[#111113] p-4 text-center">
          <p className="text-2xl font-bold text-[#f4f4f5]">{totalSets}</p>
          <p className="mt-0.5 text-[11px] uppercase tracking-wide text-[#71717a]">Sets logged, all time</p>
        </div>

        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-[#71717a]">Personal records</p>
        <div className="mt-2 space-y-2">
          {sorted.map((r) => {
            const meta = rankMeta(r.tier);
            return (
              <div key={r.muscle} className="flex items-center justify-between rounded-xl border border-[#1f1f23] bg-[#111113] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-[#e4e4e7]">{MUSCLE_LABELS[r.muscle]}</p>
                  <p className="mt-0.5 truncate text-[11px] text-[#71717a]">
                    {r.bestLift ? `${r.bestLift.name} — ${r.bestLift.weight_lb}lb × ${r.bestLift.reps}` : "No sets logged yet"}
                  </p>
                </div>
                <div className="ml-2 flex shrink-0 items-center gap-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={meta.badge} alt="" className="h-5 w-5" />
                  <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: meta.color ?? "#a1a1aa" }}>
                    {meta.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
