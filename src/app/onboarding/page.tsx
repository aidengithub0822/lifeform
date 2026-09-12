"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  estimateMaintenanceCalories,
  calorieTargetForPhase,
  recommendedProteinG,
  macroSplit,
} from "@/lib/nutrition";
import type { GoalPhase } from "@/lib/types";

// Pre-filled defaults matching a lean-bulk starting point: ~140 lb, 6'0" (72in),
// bulking at ~0.75 lb/week. Every field is editable — this is a starting point,
// not a locked-in plan.
export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [weight, setWeight] = useState(140);
  const [height, setHeight] = useState(72);
  const [phase, setPhase] = useState<GoalPhase>("bulk");
  const [weeklyRate, setWeeklyRate] = useState(0.75);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maintenance = estimateMaintenanceCalories(weight, height);
  const calorieTarget = calorieTargetForPhase(maintenance, phase, weeklyRate);
  const proteinG = recommendedProteinG(weight, phase);
  const { carbsG, fatG } = macroSplit(calorieTarget, proteinG);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("goals").upsert({
      user_id: user.id,
      phase,
      calorie_target: calorieTarget,
      protein_target_g: proteinG,
      carb_target_g: carbsG,
      fat_target_g: fatG,
      current_weight_lb: weight,
      height_in: height,
      weekly_rate_lb: weeklyRate,
      sex: "male",
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <h1 className="text-2xl font-bold">Set your targets</h1>
      <p className="mt-1 text-sm text-zinc-400">
        Starting point for a lean bulk — adjust anytime as you gain.
      </p>

      <div className="mt-8 space-y-6">
        <Field label={`Current weight: ${weight} lb`}>
          <input
            type="range"
            min={100}
            max={260}
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field label={`Height: ${Math.floor(height / 12)}'${height % 12}"`}>
          <input
            type="range"
            min={58}
            max={80}
            value={height}
            onChange={(e) => setHeight(Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field label="Phase">
          <div className="grid grid-cols-3 gap-2">
            {(["bulk", "maintain", "cut"] as GoalPhase[]).map((p) => (
              <button
                key={p}
                onClick={() => setPhase(p)}
                className={`rounded-xl py-2 text-sm font-semibold capitalize ${
                  phase === p ? "bg-emerald-500 text-black" : "bg-zinc-900 text-zinc-300"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </Field>

        {phase !== "maintain" && (
          <Field label={`Target rate: ${weeklyRate.toFixed(2)} lb/week`}>
            <input
              type="range"
              min={0.25}
              max={1.5}
              step={0.25}
              value={weeklyRate}
              onChange={(e) => setWeeklyRate(Number(e.target.value))}
              className="w-full"
            />
          </Field>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-3 text-sm font-semibold text-zinc-300">Your daily targets</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Stat label="Calories" value={calorieTarget.toLocaleString()} />
            <Stat label="Protein" value={`${proteinG} g`} />
            <Stat label="Carbs" value={`${carbsG} g`} />
            <Stat label="Fat" value={`${fatG} g`} />
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Rough estimate from your stats — dial it in over 2-3 weeks using actual weigh-ins.
          </p>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-black disabled:opacity-60"
        >
          {saving ? "Saving..." : "Start tracking"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-300">{label}</p>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-950 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
