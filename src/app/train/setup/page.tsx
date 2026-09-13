"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SPLITS } from "@/lib/trainingSplits";
import type { SplitDefinition } from "@/lib/trainingSplits";
import type { TrainingGoal } from "@/lib/types";

const GOAL_OPTIONS: { key: TrainingGoal; title: string; desc: string }[] = [
  { key: "build_muscle", title: "Build muscle", desc: "Hypertrophy-focused volume" },
  { key: "get_stronger", title: "Get stronger", desc: "Lower reps, heavier compounds" },
  { key: "lose_fat", title: "Lose fat, keep muscle", desc: "Maintain strength in a deficit" },
  { key: "general_fitness", title: "General fitness", desc: "Balanced, sustainable training" },
];

// Simple goal -> recommended-split heuristic. Not personalized yet (that's
// the AI-integrated exercise list work queued up next) but each pick has a
// real rationale, shown on the result screen.
const RECOMMENDED: Record<TrainingGoal, SplitDefinition["key"]> = {
  build_muscle: "ppl",
  get_stronger: "upper_lower",
  lose_fat: "upper_lower",
  general_fitness: "bro_split",
};

type Step = "goal" | "details" | "result";

export default function TrainSetupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState<Step>("goal");
  const [goal, setGoal] = useState<TrainingGoal | null>(null);
  const [idealWeight, setIdealWeight] = useState("");
  const [sex, setSex] = useState<"male" | "female">("male");
  const [chosenSplit, setChosenSplit] = useState<SplitDefinition["key"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
     
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("goals").select("sex").eq("user_id", user.id).maybeSingle();
      if (data?.sex === "male" || data?.sex === "female") setSex(data.sex);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickGoal(g: TrainingGoal) {
    setGoal(g);
    setChosenSplit(RECOMMENDED[g]);
    setStep("details");
  }

  async function save(splitKey: SplitDefinition["key"]) {
    if (!goal) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/training-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        training_goal: goal,
        split_type: splitKey,
        ideal_weight_lb: idealWeight ? Number(idealWeight) : null,
        sex,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save your plan");
      return;
    }
    router.push("/fitness");
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-6">
      <div className="flex items-center gap-2.5">
        {step !== "goal" && (
          <button
            onClick={() => setStep(step === "result" ? "details" : "goal")}
            aria-label="Back"
            className="text-[#71717a]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="flex flex-1 gap-1.5">
          {(["goal", "details", "result"] as Step[]).map((s, i) => (
            <div
              key={s}
              className="h-[3px] flex-1 rounded-full"
              style={{
                background:
                  (["goal", "details", "result"] as Step[]).indexOf(step) >= i ? "#10b981" : "#27272a",
              }}
            />
          ))}
        </div>
        <span className="text-[11px] text-[#52525b]">
          {(["goal", "details", "result"] as Step[]).indexOf(step) + 1} / 3
        </span>
      </div>

      {step === "goal" && (
        <div className="mt-9 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Setting up Train</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">What&apos;s your main goal right now?</h1>
          <p className="mt-1.5 text-sm text-[#71717a]">This decides the training split we build for you.</p>

          <div className="mt-7 space-y-2.5">
            {GOAL_OPTIONS.map((g) => (
              <button
                key={g.key}
                onClick={() => pickGoal(g.key)}
                className="flex w-full items-center gap-3 rounded-2xl border border-[#1f1f23] bg-[#111113] p-4 text-left active:scale-[0.99]"
              >
                <span className="h-5 w-5 shrink-0 rounded-full border-[1.5px] border-[#3f3f46]" />
                <div>
                  <div className="text-[14.5px] font-semibold text-[#e4e4e7]">{g.title}</div>
                  <div className="mt-0.5 text-xs text-[#71717a]">{g.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "details" && goal && (
        <div className="mt-9 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Setting up Train</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">A couple quick numbers</h1>
          <p className="mt-1.5 text-sm text-[#71717a]">
            Used only to judge your lift strength fairly once you start logging sets.
          </p>

          <div className="mt-7 space-y-5">
            <div>
              <label className="text-xs font-medium text-[#a1a1aa]">Ideal body weight (lb)</label>
              <input
                type="number"
                value={idealWeight}
                onChange={(e) => setIdealWeight(e.target.value)}
                placeholder="e.g. 180"
                className="mt-1.5 w-full rounded-xl border border-[#27272a] bg-[#111113] px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#a1a1aa]">Gender</label>
              <div className="mt-1.5 flex gap-1 rounded-full bg-[#111113] p-1">
                <button
                  onClick={() => setSex("male")}
                  className={`flex-1 rounded-full py-2 text-sm font-semibold ${
                    sex === "male" ? "bg-[#10b981] text-[#052e1c]" : "text-[#a1a1aa]"
                  }`}
                >
                  Man
                </button>
                <button
                  onClick={() => setSex("female")}
                  className={`flex-1 rounded-full py-2 text-sm font-semibold ${
                    sex === "female" ? "bg-[#10b981] text-[#052e1c]" : "text-[#a1a1aa]"
                  }`}
                >
                  Woman
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep("result")}
            className="mt-9 w-full rounded-xl bg-[#10b981] py-3 text-sm font-semibold text-[#052e1c]"
          >
            Continue
          </button>
        </div>
      )}

      {step === "result" && goal && chosenSplit && (
        <div className="mt-9 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#10b981]">Based on your answers</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Pick your split</h1>
          <p className="mt-1.5 text-sm text-[#71717a]">
            Any of these work — pick the one that matches how you like to train. You can switch later.
          </p>

          <div className="mt-6 space-y-3">
            {(Object.values(SPLITS) as SplitDefinition[]).map((split) => {
              const recommended = split.key === RECOMMENDED[goal];
              const selected = chosenSplit === split.key;
              return (
                <button
                  key={split.key}
                  onClick={() => setChosenSplit(split.key)}
                  className="relative block w-full rounded-2xl p-4 text-left"
                  style={{
                    border: `1.5px solid ${selected ? "#10b981" : "#1f1f23"}`,
                    background: selected ? "#0d1a15" : "#111113",
                  }}
                >
                  {recommended && (
                    <span className="absolute -top-2.5 left-3.5 rounded-md bg-[#10b981] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#052e1c]">
                      Recommended
                    </span>
                  )}
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-base font-bold text-[#f4f4f5]">{split.label}</span>
                    <span className="tabular-nums text-xs text-[#a1a1aa]">{split.daysPerWeek} days/wk</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#a1a1aa]">{split.summary}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-[#71717a]">{split.tradeoff}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {split.days.map((d) => (
                      <span key={d.key} className="rounded-lg bg-[#18181b] px-2.5 py-1 text-[10.5px] text-[#71717a]">
                        {d.label}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          <button
            onClick={() => save(chosenSplit)}
            disabled={saving}
            className="mt-6 w-full rounded-xl bg-[#10b981] py-3 text-sm font-semibold text-[#052e1c] disabled:opacity-60"
          >
            {saving ? "Saving..." : `Start with ${SPLITS[chosenSplit].label}`}
          </button>
        </div>
      )}
    </div>
  );
}
