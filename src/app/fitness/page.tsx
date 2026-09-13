"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORIES, WORKOUTS, type MuscleCategory } from "@/lib/workoutCatalog";
import {
  SPLITS,
  currentDay,
  ALL_EXERCISES,
  MUSCLE_GROUPS,
  MUSCLE_LABELS,
  exercisesForMuscle,
  type SplitExercise,
  type MuscleGroup,
} from "@/lib/trainingSplits";
import type { TrainingPlan, Lift } from "@/lib/types";
import XpSparkToast from "@/components/XpSparkToast";

type Sex = "male" | "female";

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
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-900/40 bg-emerald-500/10 px-3 py-2.5 text-xs font-medium text-emerald-400">
        Logged {weight} lb × {reps} for {sets} {Number(sets) === 1 ? "set" : "sets"} ✓
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
  const [pickerMuscle, setPickerMuscle] = useState<MuscleGroup | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {

    (async () => {
      const res = await fetch("/api/training-plan");
      if (res.ok) {
        const body = await res.json();
        setPlan(body.plan);
      }
      setPlanLoading(false);
    })();
  }, []);

  const split = plan ? SPLITS[plan.split_type] : null;
  const day = plan ? currentDay(plan.split_type, plan.day_index) : null;

  function markLogged(exerciseName: string) {
    setLoggedNames((prev) => new Set(prev).add(exerciseName));
    setOpenExercise(null);
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

  const pickerExercises: SplitExercise[] = pickerMuscle ? exercisesForMuscle(pickerMuscle) : ALL_EXERCISES;

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <XpSparkToast xp={sparkXp} onDone={() => setSparkXp(null)} />
      <Link href="/" className="text-sm font-medium text-emerald-400">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Fitness</h1>
      <p className="mt-1 text-sm text-zinc-400">Pick a muscle group to see what to train today.</p>

      {!planLoading && plan && split && day && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-[#e4e4e7]">Today&apos;s workout</span>
            <span className="text-xs text-[#52525b]">
              {split.label} · {day.label}
            </span>
          </div>
          <div className="mt-3">
            {day.exercises.map((exercise) => {
              const isOpen = openExercise === exercise.name;
              const isLogged = loggedNames.has(exercise.name);
              return (
                <div key={exercise.name} className="border-b border-[#1a1a1d] py-3">
                  <button
                    onClick={() => setOpenExercise(isOpen ? null : exercise.name)}
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
                  {isOpen && (
                    <LogSetForm exercise={exercise} onLogged={() => markLogged(exercise.name)} />
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={() => setShowPicker((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-dashed border-[#27272a] px-3.5 py-2.5 text-left"
          >
            <span className="text-xs font-medium text-[#a1a1aa]">
              {showPicker ? "Hide exercise list" : "Log a different exercise"}
            </span>
            <span className="text-[#52525b]">{showPicker ? "︿" : "﹀"}</span>
          </button>

          {showPicker && (
            <div className="mt-2.5 rounded-2xl border border-[#1f1f23] bg-[#0d0d0f] p-3">
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                <button
                  onClick={() => setPickerMuscle(null)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                    pickerMuscle === null ? "bg-emerald-500 text-black" : "bg-[#18181b] text-[#a1a1aa]"
                  }`}
                >
                  All
                </button>
                {MUSCLE_GROUPS.map((m) => (
                  <button
                    key={m}
                    onClick={() => setPickerMuscle(m)}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold ${
                      pickerMuscle === m ? "bg-emerald-500 text-black" : "bg-[#18181b] text-[#a1a1aa]"
                    }`}
                  >
                    {MUSCLE_LABELS[m]}
                  </button>
                ))}
              </div>
              <div className="mt-2 max-h-72 overflow-y-auto">
                {pickerExercises.map((exercise) => {
                  const isOpen = openExercise === `picker:${exercise.name}`;
                  const isLogged = loggedNames.has(exercise.name);
                  return (
                    <div key={exercise.name} className="border-b border-[#1a1a1d] py-2.5 last:border-0">
                      <button
                        onClick={() => setOpenExercise(isOpen ? null : `picker:${exercise.name}`)}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-[#e4e4e7]">{exercise.name}</p>
                          <p className="mt-0.5 text-[11px] text-[#71717a]">
                            {exercise.sets} sets · {exercise.repRange} reps
                          </p>
                        </div>
                        {isLogged && <span className="shrink-0 text-[11px] font-medium text-emerald-400">✓</span>}
                        <span className="shrink-0 text-[#3f3f46]">{isOpen ? "︿" : "﹀"}</span>
                      </button>
                      {isOpen && (
                        <LogSetForm exercise={exercise} onLogged={() => markLogged(exercise.name)} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {!planLoading && !plan && (
        <Link
          href="/train/setup"
          className="mt-5 flex items-center justify-between rounded-2xl border border-[#1f1f23] bg-[#111113] px-4 py-3.5"
        >
          <span className="text-sm font-medium text-[#e4e4e7]">Set up your training split to see today&apos;s workout</span>
          <span className="text-[#71717a]">›</span>
        </Link>
      )}

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

      <div className="lf-gradient-border mt-5 overflow-hidden p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sex === "male" ? "/fitness/male-diagram.jpg" : "/fitness/female-diagram.jpg"}
          alt={`${sex === "male" ? "Male" : "Female"} muscle group diagram, front and back`}
          className="w-full rounded-xl object-contain"
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => setCategory(c.key)}
            className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center active:scale-[0.97] ${
              category === c.key
                ? "border-emerald-500 bg-emerald-500/10"
                : "border-zinc-800 bg-zinc-900"
            }`}
          >
            <span className="text-xl">{c.icon}</span>
            <span className="text-xs font-semibold text-zinc-200">{c.label}</span>
          </button>
        ))}
      </div>

      {category && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-300">
            {CATEGORIES.find((c) => c.key === category)?.label} workout
          </h2>
          <div className="mt-3 space-y-2.5">
            {WORKOUTS[category].map((ex) => (
              <div key={ex.name} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-zinc-100">{ex.name}</p>
                  <p className="shrink-0 text-xs font-medium text-emerald-400">{ex.sets}</p>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{ex.notes}</p>
              </div>
            ))}
          </div>

          <button
            onClick={logWorkout}
            disabled={logging || logged}
            className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {logged ? "Logged for today ✓" : logging ? "Logging..." : "I trained today"}
          </button>
        </div>
      )}
    </div>
  );
}
