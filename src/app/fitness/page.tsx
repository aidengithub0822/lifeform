"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CATEGORIES, WORKOUTS, type MuscleCategory } from "@/lib/workoutCatalog";
import { SPLITS, currentDay } from "@/lib/trainingSplits";
import type { TrainingPlan } from "@/lib/types";
import XpSparkToast from "@/components/XpSparkToast";

type Sex = "male" | "female";

export default function FitnessPage() {
  const [sex, setSex] = useState<Sex>("male");
  const [category, setCategory] = useState<MuscleCategory | null>(null);
  const [logged, setLogged] = useState(false);
  const [logging, setLogging] = useState(false);
  const [sparkXp, setSparkXp] = useState<number | null>(null);
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(true);

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

      {!planLoading && plan && split && day && (
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-[#e4e4e7]">Today&apos;s workout</span>
            <span className="text-xs text-[#52525b]">
              {split.label} · {day.label}
            </span>
          </div>
          <div className="mt-3">
            {day.exercises.map((exercise) => (
              <div key={exercise.name} className="flex items-center gap-3 border-b border-[#1a1a1d] py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#f4f4f5]">{exercise.name}</p>
                  <p className="mt-0.5 text-xs text-[#71717a]">
                    {exercise.sets} sets · {exercise.repRange} reps
                  </p>
                </div>
                <span className="shrink-0 text-[11px] capitalize text-[#52525b]">{exercise.muscles[0]}</span>
              </div>
            ))}
          </div>
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
