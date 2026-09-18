import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Flame from "@/components/Flame";
import HeaderMenu from "@/components/HeaderMenu";
import WeeklyTrends, { type DayTotal } from "@/components/WeeklyTrends";
import RefreshOnPull from "@/components/RefreshOnPull";
import FoodLogItem from "@/components/FoodLogItem";
import type { FoodLog, Goal } from "@/lib/types";

function todayRangeUTC() {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Builds the last 7 calendar days (oldest first) as YYYY-MM-DD, in the
// browser's/server's local view of UTC-day boundaries — good enough for a
// trend chart without needing per-user timezone storage.
function last7Days(): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: goal }, { data: profile }] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).maybeSingle<Goal>(),
    supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle<{ username: string | null }>(),
  ]);

  // Username is a forced gate for every account (new or pre-existing) —
  // checked ahead of the goal check since onboarding's own first step is
  // now the username picker.
  if (!profile?.username || !goal) redirect("/onboarding");

  const { start, end } = todayRangeUTC();
  const weekDays = last7Days();
  const [{ data: logs }, { data: weekLogs }] = await Promise.all([
    supabase
      .from("food_logs")
      .select("*")
      .eq("user_id", user.id)
      .gte("logged_at", start)
      .lt("logged_at", end)
      .order("logged_at", { ascending: false })
      .returns<FoodLog[]>(),
    supabase
      .from("food_logs")
      .select("logged_at, calories, protein_g, score")
      .eq("user_id", user.id)
      .gte("logged_at", weekDays[0])
      .returns<Pick<FoodLog, "logged_at" | "calories" | "protein_g" | "score">[]>(),
  ]);

  const entries = logs ?? [];
  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + Number(e.protein_g),
      carbs: acc.carbs + Number(e.carbs_g),
      fat: acc.fat + Number(e.fat_g),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const dayTotals: DayTotal[] = weekDays.map((date) => {
    const rows = (weekLogs ?? []).filter((r) => String(r.logged_at).slice(0, 10) === date);
    const calories = rows.reduce((a, r) => a + r.calories, 0);
    const protein = rows.reduce((a, r) => a + Number(r.protein_g), 0);
    const avgScore = rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : null;
    return { date, calories, protein, avgScore };
  });

  return (
    <RefreshOnPull>
    <div className="mx-auto max-w-md px-5 pt-6">
      <div className="relative flex items-center justify-between">
        <HeaderMenu goal={goal} />
        {/* Static wordmark, dead center — not a button. Settings moved to
            the gear icon on the left (see HeaderMenu) so this can just be
            the app's logo instead of doubling as an easy-to-fat-finger menu
            trigger. */}
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-lg font-extrabold lowercase tracking-tight text-emerald-400">
          lifeform
        </span>
        <Flame />
      </div>

      <div className="mt-7">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-[#a1a1aa]">Remaining today</p>
          <p className="text-xs capitalize text-[#52525b]">{goal.phase} phase</p>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-[34px] font-bold tracking-tight tabular-nums">
            {Math.max(0, Math.round(goal.calorie_target - totals.calories))}
          </span>
          <span className="text-sm text-[#71717a] tabular-nums">of {goal.calorie_target}</span>
        </div>
        <ProgressBar value={totals.calories} target={goal.calorie_target} />

        <div className="mt-4 grid grid-cols-3 gap-3">
          <MacroCol label="Protein" value={totals.protein} target={goal.protein_target_g} color="#10b981" />
          <MacroCol label="Carbs" value={totals.carbs} target={goal.carb_target_g} color="#38bdf8" />
          <MacroCol label="Fat" value={totals.fat} target={goal.fat_target_g} color="#f59e0b" />
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#e4e4e7]">Today</h2>
        <Link href="/scan" className="text-sm font-medium text-emerald-400">
          + Add food
        </Link>
      </div>

      <div className="mt-1">
        {entries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#27272a] py-10 text-center text-sm text-[#71717a]">
            Nothing logged yet today.
            <br />
            <Link href="/scan" className="mt-2 inline-block font-semibold text-emerald-400">
              Log food →
            </Link>
          </div>
        )}
        {entries.map((entry) => (
          <FoodLogItem
            key={entry.id}
            id={entry.id}
            foodName={entry.food_name}
            calories={entry.calories}
            proteinG={entry.protein_g}
            score={entry.score}
            loggedAt={entry.logged_at}
          />
        ))}
      </div>

      {entries.length > 0 && (
        <Link href="/scan/history" className="mt-3 block text-center text-xs font-medium text-[#52525b]">
          View full food log history →
        </Link>
      )}

      <WeeklyTrends days={dayTotals} calorieTarget={goal.calorie_target} />

      <div className="mt-7 grid grid-cols-2 gap-3">
        <Link
          href="/recipes"
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[#27272a] bg-[#111113] py-4 text-center active:scale-[0.98]"
        >
          <span className="text-sm font-semibold text-[#e4e4e7]">Recipes</span>
          <span className="text-xs text-[#71717a]">Saved recipes you can log in one tap</span>
        </Link>
        <Link
          href="/discover"
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[#27272a] bg-[#111113] py-4 text-center active:scale-[0.98]"
        >
          <span className="text-sm font-semibold text-[#e4e4e7]">Meal ideas</span>
          <span className="text-xs text-[#71717a]">Budget-aware picks + places to eat</span>
        </Link>
      </div>

      <div className="pb-8" />
    </div>
    </RefreshOnPull>
  );
}

function ProgressBar({ value, target }: { value: number; target: number }) {
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-[#1c1c1f]">
      <div className="h-full bg-[#10b981]" style={{ width: `${Math.min(100, (value / target) * 100)}%` }} />
      {pct < 100 && <div className="h-full flex-1" />}
    </div>
  );
}

function MacroCol({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  const pct = Math.min(100, (value / target) * 100);
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="text-[#a1a1aa]">{label}</span>
        <span className="tabular-nums text-[#71717a]">
          {Math.round(value)}/{target}g
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[#1c1c1f]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
