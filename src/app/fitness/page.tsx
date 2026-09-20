"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORIES, type MuscleCategory } from "@/lib/workoutCatalog";
import { LIFT_SUBSECTIONS, resolveSubsection } from "@/lib/liftBrowser";
import {
  SPLITS,
  currentDay,
  MUSCLE_LABELS,
  type SplitExercise,
  type MuscleGroup,
} from "@/lib/trainingSplits";
import type { TrainingPlan, Lift } from "@/lib/types";
import XpSparkToast from "@/components/XpSparkToast";
import MuscleMapOverlay from "@/components/MuscleMapOverlay";
import RankCalculator from "@/components/RankCalculator";
import ExerciseStatsPanel from "@/components/ExerciseStatsPanel";
import LiftHistoryPanel from "@/components/LiftHistoryPanel";
import { rankMeta, RANK_TIERS, type RankTier } from "@/lib/rank";

type Sex = "male" | "female";

interface RankSummary {
  tier: RankTier;
  label: string;
  color: string | null;
  badge: string;
  xp: number;
  level: number;
  progress: number;
  nextTier: RankTier | null;
  nextTierLabel: string | null;
  limitingFactor: "time" | "xp" | "strength" | null;
}

interface MuscleRankApiResult {
  muscle: MuscleGroup;
  tier: RankTier;
  score: number;
  bestLift: { name: string; weight_lb: number; reps: number } | null;
  totalSetsLogged: number;
  qualifyingDays: number;
  progress: number;
  nextTier: RankTier | null;
  limitingFactor: "score" | "days" | null;
  daysNeededForNextTier: number | null;
  scoreNeededForNextTier: number | null;
}

// Inline set-logging form shown under a tapped exercise row. Kept as its own
// component so each row owns its own weight/reps/sets draft state instead of
// one shared draft that would leak between rows.
function LogSetForm({
  exercise,
  onLogged,
}: {
  exercise: SplitExercise;
  onLogged: (lift: Lift) => void;
}) {
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState(String(exercise.sets));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError(null);
    const weightLb = Number(weight);
    const repsN = Number(reps);
    const setsN = Number(sets);
    if (!Number.isFinite(weightLb) || weightLb < 0) return setError("Enter a valid weight");
    if (!Number.isInteger(repsN) || repsN <= 0) return setError("Enter a valid rep count");
    if (!Number.isInteger(setsN) || setsN <= 0) return setError("Enter a valid set count");

    setSaving(true);
    try {
      const res = await fetch("/api/lifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lift_name: exercise.name, weight_lb: weightLb, reps: repsN, sets: setsN }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't save that lift");
        return;
      }
      setSaved(true);
      if (body.lift) onLogged(body.lift as Lift);
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-emerald-900/40 bg-emerald-500/10 px-3 py-2.5 text-xs font-medium text-emerald-400">
        <span>
          Logged {weight} lb × {reps} for {sets} {Number(sets) === 1 ? "set" : "sets"} ✓
        </span>
        <button
          onClick={() => setSaved(false)}
          className="shrink-0 rounded-full border border-emerald-500/40 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"
        >
          Log another
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-[#1f1f23] bg-[#0d0d0f] p-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">Weight (lb)</label>
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="135"
            className="mt-1 w-full rounded-lg border border-[#27272a] bg-[#111113] px-2.5 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">Reps</label>
          <input
            type="number"
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            placeholder="8"
            className="mt-1 w-full rounded-lg border border-[#27272a] bg-[#111113] px-2.5 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">Sets</label>
          <input
            type="number"
            inputMode="numeric"
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#27272a] bg-[#111113] px-2.5 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <button
        onClick={submit}
        disabled={saving}
        className="mt-2.5 w-full rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-black disabled:opacity-60"
      >
        {saving ? "Saving..." : "Log set"}
      </button>
    </div>
  );
}

export default function FitnessPage() {
  const [sex, setSex] = useState<Sex>("male");
  const [category, setCategory] = useState<MuscleCategory | null>(null);
  const [logged, setLogged] = useState(false);
  const [logging, setLogging] = useState(false);
  const [sparkXp, setSparkXp] = useState<number | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [openExercise, setOpenExercise] = useState<string | null>(null);
  const [loggedNames, setLoggedNames] = useState<Set<string>>(new Set());
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [showToday, setShowToday] = useState(false);
  // Remembered lifts: exercise name -> recency (lower = logged more recently).
  // `history` drives the green highlight and updates live as you log;
  // `orderHistory` is what the lists are SORTED by and is only refreshed when
  // you open a section, so a row never jumps out from under your finger.
  const [history, setHistory] = useState<Map<string, number>>(new Map());
  const [orderHistory, setOrderHistory] = useState<Map<string, number>>(new Map());
  const [muscleRanks, setMuscleRanks] = useState<MuscleRankApiResult[] | null>(null);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleGroup | null>(null);
  const [rankSummary, setRankSummary] = useState<RankSummary | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showLifts, setShowLifts] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [bodyweightLb, setBodyweightLb] = useState<number | null>(null);

  useEffect(() => {

    (async () => {
      const res = await fetch("/api/training-plan");
      if (res.ok) {
        const body = await res.json();
        setPlan(body.plan);
      }
      setPlanLoading(false);
    })();
    refreshMuscleRanks();
    refreshRankSummary();
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const res = await fetch("/api/lifts?limit=1000");
      if (!res.ok) return;
      const body = await res.json();
      const map = new Map<string, number>();
      // The API returns newest first, so a name's first appearance is its latest log.
      for (const l of (body.lifts ?? []) as Lift[]) {
        if (!map.has(l.lift_name)) map.set(l.lift_name, map.size);
      }
      setHistory(map);
      setOrderHistory(map);
    } catch {
      // Highlighting is a nicety — the lists still work without it.
    }
  }

  async function refreshMuscleRanks() {
    const res = await fetch("/api/muscle-rank");
    if (res.ok) {
      const body = await res.json();
      setMuscleRanks(body.ranks);
      if (typeof body.bodyweightLb === "number") setBodyweightLb(body.bodyweightLb);
    }
  }

  async function refreshRankSummary() {
    const res = await fetch("/api/rank");
    if (res.ok) setRankSummary(await res.json());
  }

  const split = plan ? SPLITS[plan.split_type] : null;
  const day = plan ? currentDay(plan.split_type, plan.day_index) : null;

  const ranksByMuscle: Partial<Record<MuscleGroup, RankTier>> = {};
  for (const r of muscleRanks ?? []) ranksByMuscle[r.muscle] = r.tier;
  const selectedRank = muscleRanks?.find((r) => r.muscle === selectedMuscle) ?? null;

  function markLogged(exerciseName: string) {
    setLoggedNames((prev) => new Set(prev).add(exerciseName));
    setHistory((prev) => {
      const next = new Map(prev);
      let min = 0;
      for (const v of next.values()) min = Math.min(min, v);
      next.set(exerciseName, min - 1);
      return next;
    });
    // The set that was just logged may have moved this muscle's rank —
    // refresh so the map reflects it without a full page reload.
    refreshMuscleRanks();
    refreshRankSummary();
  }

  async function logWorkout() {
    setLogging(true);
    try {
      const res = await fetch("/api/workouts", { method: "POST" });
      if (res.ok) {
        const body = await res.json();
        setLogged(true);
        if (body.spark) setSparkXp(body.spark.xpEarned);
      }
      // Advance the split's day rotation regardless of whether today was
      // already checked in — it's the "I finished this day" signal.
      if (plan) fetch("/api/training-plan", { method: "PATCH" }).catch(() => {});
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <XpSparkToast xp={sparkXp} onDone={() => setSparkXp(null)} />
      <Link href="/" className="text-sm font-medium text-emerald-400">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Fitness</h1>
      <p className="mt-1 text-sm text-zinc-400">Pick a muscle group to see what to train today.</p>

      {rankSummary && (
        <div
          className="mt-5 rounded-2xl border p-4"
          style={{
            borderColor: `${rankSummary.color ?? "#3f3f46"}55`,
            background: `linear-gradient(135deg, ${rankSummary.color ?? "#3f3f46"}22, #111113)`,
            boxShadow: `0 0 24px -8px ${rankSummary.color ?? "#3f3f46"}66`,
          }}
        >
          <div className="flex items-center gap-3.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rankSummary.badge} alt="" className="h-14 w-14 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#a1a1aa]">Overall Rank</p>
              <p className="truncate text-xl font-extrabold uppercase tracking-tight" style={{ color: rankSummary.color ?? "#f4f4f5" }}>
                {rankSummary.label}
              </p>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-[#a1a1aa]">
                <span>
                  <span className="font-semibold text-[#e4e4e7]">Level</span> {rankSummary.level}
                </span>
                {rankSummary.nextTier && (
                  <span>
                    <span className="font-semibold text-[#e4e4e7]">Rank progress</span> {Math.round(rankSummary.progress * 100)}%
                  </span>
                )}
              </div>
            </div>
          </div>
          {rankSummary.nextTier ? (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#1f1f23]">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(4, rankSummary.progress * 100)}%`, backgroundColor: rankSummary.color ?? "#71717a" }}
              />
            </div>
          ) : (
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#71717a]">Top tier reached</p>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2.5">
        <button
          onClick={() => setShowStats(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#1f1f23] bg-[#111113] py-2.5 text-xs font-semibold text-[#e4e4e7]"
        >
          📊 Exercise Stats
        </button>
        <button
          onClick={() => setShowCalculator(true)}
          className="flex flex-1 items-center justify-center gap-2 rounded-full border border-[#1f1f23] bg-[#111113] py-2.5 text-xs font-semibold text-[#e4e4e7]"
        >
          🧮 Rank Calculator
        </button>
      </div>
      <button
        onClick={() => setShowLifts(true)}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full border border-[#1f1f23] bg-[#111113] py-2.5 text-xs font-semibold text-[#e4e4e7]"
      >
        🏋️ My lifts — edit or delete
      </button>

      <div className="mt-6 flex gap-1 rounded-full bg-zinc-900 p-1">
        <button
          onClick={() => setSex("male")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${
            sex === "male" ? "bg-emerald-500 text-black" : "text-zinc-400"
          }`}
        >
          Man
        </button>
        <button
          onClick={() => setSex("female")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${
            sex === "female" ? "bg-emerald-500 text-black" : "text-zinc-400"
          }`}
        >
          Woman
        </button>
      </div>

      <p className="mt-4 text-xs text-[#71717a]">
        Each muscle is colored by its own rank, from your logged lifts relative to your bodyweight. Tap a muscle for details.
      </p>
      <MuscleMapOverlay sex={sex} ranks={ranksByMuscle} onSelect={(m) => setSelectedMuscle(m === selectedMuscle ? null : m)} />

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {RANK_TIERS.filter((t) => t.tier !== "newbie").map((t) => (
          <div key={t.tier} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color ?? "#3f3f46" }} />
            <span className="text-[10px] font-medium text-[#71717a]">{t.label}</span>
          </div>
        ))}
      </div>

      {selectedRank && (
        <div className="mt-3 rounded-2xl border border-[#1f1f23] bg-[#111113] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[#f4f4f5]">{MUSCLE_LABELS[selectedRank.muscle]}</span>
            <div className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rankMeta(selectedRank.tier).badge} alt="" className="h-7 w-7" />
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: rankMeta(selectedRank.tier).color ?? "#a1a1aa" }}>
                {rankMeta(selectedRank.tier).label}
              </span>
            </div>
          </div>
          {selectedRank.bestLift ? (
            <p className="mt-1.5 text-xs text-[#a1a1aa]">
              Best logged: {selectedRank.bestLift.name} — {selectedRank.bestLift.weight_lb}lb × {selectedRank.bestLift.reps}
            </p>
          ) : selectedRank.totalSetsLogged > 0 ? (
            <p className="mt-1.5 text-xs text-[#a1a1aa]">{selectedRank.totalSetsLogged} sets logged so far — keep going to rank up.</p>
          ) : (
            <p className="mt-1.5 text-xs text-[#71717a]">No sets logged for this muscle yet.</p>
          )}

          {selectedRank.nextTier ? (
            <div className="mt-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#71717a]">
                  Progress to {rankMeta(selectedRank.nextTier).label}
                </span>
                <span className="text-[10px] font-semibold text-[#a1a1aa]">{Math.round(selectedRank.progress * 100)}%</span>
              </div>
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#1f1f23]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(4, selectedRank.progress * 100)}%`,
                    backgroundColor: rankMeta(selectedRank.nextTier).color ?? "#71717a",
                  }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-[#71717a]">
                {selectedRank.limitingFactor === "days" && selectedRank.daysNeededForNextTier
                  ? `${selectedRank.daysNeededForNextTier} more qualifying training day${selectedRank.daysNeededForNextTier === 1 ? "" : "s"} at this strength level to rank up.`
                  : selectedRank.limitingFactor === "score" && selectedRank.scoreNeededForNextTier
                    ? "Lift heavier relative to your bodyweight to open up qualifying days for this tier."
                    : "Keep training consistently to rank up."}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#71717a]">Top tier reached</p>
          )}
        </div>
      )}

      {!muscleRanks && (
        <p className="mt-3 text-center text-xs text-[#52525b]">Loading muscle ranks…</p>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-zinc-200">Log a lift</h2>
        <p className="mt-0.5 text-xs text-[#71717a]">Pick a muscle group, then a muscle, then tap an exercise to log it.</p>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => {
                setCategory(category === c.key ? null : c.key);
                setOpenSub(null);
                setOpenExercise(null);
                setOrderHistory(history);
              }}
              className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3.5 text-center active:scale-[0.97] ${
                category === c.key ? "border-emerald-500 bg-emerald-500/10" : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <span className="text-xl">{c.icon}</span>
              <span className="text-xs font-semibold text-zinc-200">{c.label}</span>
            </button>
          ))}
        </div>

        {category && (
          <div className="mt-4 space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#71717a]">
              {CATEGORIES.find((c) => c.key === category)?.label}
            </p>
            {LIFT_SUBSECTIONS[category].map((sub) => {
              const subKey = `${category}:${sub.key}`;
              const isSubOpen = openSub === subKey;
              // Lifts you've logged before float to the top (most recent first),
              // then everything else in the catalog's own order.
              const exercises = resolveSubsection(sub)
                .map((exercise, idx) => ({ exercise, idx }))
                .sort((a, b) => {
                  const ra = orderHistory.get(a.exercise.name);
                  const rb = orderHistory.get(b.exercise.name);
                  if (ra !== undefined && rb !== undefined) return ra - rb;
                  if (ra !== undefined) return -1;
                  if (rb !== undefined) return 1;
                  return a.idx - b.idx;
                })
                .map((x) => x.exercise);
              const rememberedCount = exercises.filter((e) => history.has(e.name)).length;
              return (
                <div key={subKey} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                  <button
                    onClick={() => {
                      setOpenSub(isSubOpen ? null : subKey);
                      setOpenExercise(null);
                      setOrderHistory(history);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-100">{sub.label}</p>
                      <p className="mt-0.5 text-[11px] text-[#71717a]">
                        {exercises.length} exercises
                        {rememberedCount > 0 && <span className="text-emerald-400"> · {rememberedCount} logged before</span>}
                      </p>
                    </div>
                    <span className="shrink-0 text-[#52525b]">{isSubOpen ? "︿" : "﹀"}</span>
                  </button>
                  {isSubOpen && (
                    <div className="border-t border-zinc-800 px-4 pb-1">
                      {exercises.map((exercise) => {
                        const key = `${subKey}:${exercise.name}`;
                        const isOpen = openExercise === key;
                        const isLogged = loggedNames.has(exercise.name);
                        const remembered = history.has(exercise.name);
                        return (
                          <div
                            key={key}
                            className={`border-b border-[#1a1a1d] last:border-0 ${
                              remembered ? "-mx-4 border-l-2 border-l-emerald-500/60 bg-emerald-500/[0.07] px-[14px] py-3" : "py-3"
                            }`}
                          >
                            <button
                              onClick={() => setOpenExercise(isOpen ? null : key)}
                              className="flex w-full items-center gap-2 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-[#f4f4f5]">{exercise.name}</p>
                                <p className="mt-0.5 text-xs text-[#71717a]">
                                  {exercise.sets} sets · {exercise.repRange} reps
                                </p>
                              </div>
                              {isLogged && <span className="shrink-0 text-xs font-medium text-emerald-400">Logged ✓</span>}
                              <span className="shrink-0 text-[#3f3f46]">{isOpen ? "︿" : "﹀"}</span>
                            </button>
                            {isOpen && <LogSetForm exercise={exercise} onLogged={() => markLogged(exercise.name)} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <button
              onClick={logWorkout}
              disabled={logging || logged}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black disabled:opacity-60"
            >
              {logged ? "Logged for today ✓" : logging ? "Logging..." : "I trained today"}
            </button>
          </div>
        )}
      </section>

      {!planLoading && plan && split && day && (
        <div className="mt-6">
          <button
            onClick={() => setShowToday((v) => !v)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[#1f1f23] bg-[#111113] px-4 py-3.5 text-left"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#e4e4e7]">Today&apos;s workout</p>
              <p className="mt-0.5 text-xs text-[#71717a]">
                {split.label} · {day.label} · {day.exercises.length} exercises
              </p>
            </div>
            <span className="shrink-0 text-[#52525b]">{showToday ? "︿" : "﹀"}</span>
          </button>

          {showToday && (
            <div className="mt-2 rounded-2xl border border-[#1f1f23] bg-[#0d0d0f] px-4 pb-4">
              {day.exercises.map((exercise) => {
                const key = `today:${exercise.name}`;
                const isOpen = openExercise === key;
                const isLogged = loggedNames.has(exercise.name);
                return (
                  <div key={exercise.name} className="border-b border-[#1a1a1d] py-3 last:border-0">
                    <button
                      onClick={() => setOpenExercise(isOpen ? null : key)}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#f4f4f5]">{exercise.name}</p>
                        <p className="mt-0.5 text-xs text-[#71717a]">
                          {exercise.sets} sets · {exercise.repRange} reps
                        </p>
                      </div>
                      {isLogged && <span className="shrink-0 text-xs font-medium text-emerald-400">Logged ✓</span>}
                      <span className="shrink-0 text-[11px] capitalize text-[#52525b]">{exercise.muscles[0]}</span>
                      <span className="shrink-0 text-[#3f3f46]">{isOpen ? "︿" : "﹀"}</span>
                    </button>
                    {isOpen && <LogSetForm exercise={exercise} onLogged={() => markLogged(exercise.name)} />}
                  </div>
                );
              })}
              <button
                onClick={logWorkout}
                disabled={logging || logged}
                className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black disabled:opacity-60"
              >
                {logged ? "Logged for today ✓" : logging ? "Logging..." : "I trained today"}
              </button>
            </div>
          )}
        </div>
      )}

      {!planLoading && !plan && (
        <Link
          href="/train/setup"
          className="mt-6 flex items-center justify-between rounded-2xl border border-[#1f1f23] bg-[#111113] px-4 py-3.5"
        >
          <span className="text-sm font-medium text-[#e4e4e7]">Set up your training split to see today&apos;s workout</span>
          <span className="text-[#71717a]">›</span>
        </Link>
      )}

      {showStats && muscleRanks && (
        <ExerciseStatsPanel
          rows={muscleRanks.map((r) => ({ muscle: r.muscle, tier: r.tier, bestLift: r.bestLift, totalSetsLogged: r.totalSetsLogged }))}
          onClose={() => setShowStats(false)}
        />
      )}
      {showLifts && (
        <LiftHistoryPanel
          onClose={() => setShowLifts(false)}
          onChanged={() => {
            refreshMuscleRanks();
            refreshRankSummary();
            loadHistory();
          }}
        />
      )}
      {showCalculator && <RankCalculator defaultBodyweightLb={bodyweightLb} onClose={() => setShowCalculator(false)} />}
    </div>
  );
}
