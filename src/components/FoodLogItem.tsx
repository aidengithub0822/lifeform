"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ScoreBadge from "@/components/ScoreBadge";
import { MEAL_LABEL, MEAL_ORDER, isMealType, mealOfLog, type MealType } from "@/lib/meals";
import type { FoodLog } from "@/lib/types";

// A single food-log row with edit + delete. Used on Home's meal diary and the
// full /scan/history view. Editing fixes a wrong estimate (calories/macros),
// renames the entry, or moves it to a different meal.
export default function FoodLogItem({
  log,
  timezone,
  onDeleted,
  onUpdated,
}: {
  log: FoodLog;
  timezone?: string | null;
  onDeleted?: (id: string) => void;
  onUpdated?: (log: FoodLog) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [mode, setMode] = useState<"view" | "confirm" | "edit">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentMeal = mealOfLog(log, timezone);
  const [name, setName] = useState(log.food_name);
  const [calories, setCalories] = useState(String(log.calories));
  const [protein, setProtein] = useState(String(log.protein_g));
  const [carbs, setCarbs] = useState(String(log.carbs_g));
  const [fat, setFat] = useState(String(log.fat_g));
  const [meal, setMeal] = useState<MealType>(currentMeal);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from("food_logs").delete().eq("id", log.id);
    setBusy(false);
    if (deleteError) {
      setError(`Couldn't delete: ${deleteError.message}`);
      return;
    }
    setMode("view");
    onDeleted?.(log.id);
    router.refresh();
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give it a name.");
      return;
    }
    const num = (v: string) => (Number.isFinite(Number(v)) && v.trim() !== "" ? Math.max(0, Number(v)) : 0);
    const patch = {
      food_name: trimmed.slice(0, 200),
      calories: Math.round(num(calories)),
      protein_g: num(protein),
      carbs_g: num(carbs),
      fat_g: num(fat),
    };
    setBusy(true);
    setError(null);
    let { error: updateError } = await supabase.from("food_logs").update({ ...patch, meal }).eq("id", log.id);
    // Database without the `meal` column yet: save everything else.
    if (updateError && /meal/i.test(updateError.message)) {
      ({ error: updateError } = await supabase.from("food_logs").update(patch).eq("id", log.id));
    }
    setBusy(false);
    if (updateError) {
      setError(`Couldn't save: ${updateError.message}`);
      return;
    }
    setMode("view");
    onUpdated?.({ ...log, ...patch, meal });
    router.refresh();
  }

  const time = new Date(log.logged_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  if (mode === "confirm") {
    return (
      <div className="border-b border-[#1a1a1d] py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#f4f4f5]">Delete &quot;{log.food_name}&quot;?</p>
            <p className="text-xs text-[#71717a]">This can&apos;t be undone.</p>
          </div>
          <button
            onClick={() => setMode("view")}
            disabled={busy}
            className="rounded-lg bg-[#18181b] px-3 py-1.5 text-xs font-medium text-[#d4d4d8]"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={busy}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? "..." : "Delete"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    );
  }

  if (mode === "edit") {
    const field = "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500";
    return (
      <div className="space-y-2.5 border-b border-[#1a1a1d] py-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Food name" className={field} />
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ["Calories", calories, setCalories],
              ["Protein g", protein, setProtein],
              ["Carbs g", carbs, setCarbs],
              ["Fat g", fat, setFat],
            ] as [string, string, (v: string) => void][]
          ).map(([label, value, set]) => (
            <label key={label} className="block text-[10px] font-medium text-zinc-500">
              {label}
              <input
                value={value}
                onChange={(e) => set(e.target.value)}
                inputMode="decimal"
                className={`${field} mt-0.5`}
              />
            </label>
          ))}
        </div>
        <select
          value={meal}
          onChange={(e) => isMealType(e.target.value) && setMeal(e.target.value)}
          className={field}
        >
          {MEAL_ORDER.map((m) => (
            <option key={m} value={m}>
              {MEAL_LABEL[m]}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setMode("view");
              setError(null);
            }}
            disabled={busy}
            className="flex-1 rounded-lg bg-[#18181b] py-2 text-xs font-medium text-[#d4d4d8]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy}
            className="flex-[2] rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-black disabled:opacity-60"
          >
            {busy ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-[#1a1a1d] py-3">
      <ScoreBadge score={log.score} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#f4f4f5]">{log.food_name}</p>
        <p className="mt-0.5 text-xs tabular-nums text-[#71717a]">
          {log.calories} cal · {Math.round(Number(log.protein_g))}g protein · {time}
        </p>
      </div>
      <button
        onClick={() => setMode("edit")}
        aria-label={`Edit ${log.food_name}`}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[#71717a] active:text-emerald-400"
      >
        Edit
      </button>
      <button
        onClick={() => setMode("confirm")}
        aria-label={`Delete ${log.food_name}`}
        className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[#52525b] active:text-red-400"
      >
        Remove
      </button>
    </div>
  );
}
