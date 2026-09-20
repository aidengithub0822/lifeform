import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Flame from "@/components/Flame";
import NotificationsBell from "@/components/NotificationsBell";
import HeaderMenu from "@/components/HeaderMenu";
import WeeklyTrends, { type DayTotal } from "@/components/WeeklyTrends";
import RefreshOnPull from "@/components/RefreshOnPull";
import MealDiary from "@/components/MealDiary";
import { localDateString, localDayRangeUTC, todayLocal } from "@/lib/timezone";
import { resolveUserTimezone } from "@/lib/requestTimezone";
import { addDays } from "@/lib/streak";
import type { FoodLog, Goal } from "@/lib/types";

// Builds the CURRENT Sunday-through-Saturday calendar week (oldest first) as
// YYYY-MM-DD, so the weekly chart always reads S M T W T F S left-to-right —
// not a rolling "last 7 days" window, which can start on any weekday
// depending on what today happens to be. Days after today that fall in the
// current week are included (they'll just render as zero) — that's normal
// calendar-week behavior, not a bug. Pure string arithmetic off an
// already-correct local "today", so it needs no further timezone awareness
// of its own — see src/lib/timezone.ts for why "local", not UTC, matters.
function currentWeek(todayStr: string): string[] {
  const dow = new Date(`${todayStr}T00:00:00`).getDay(); // 0 = Sunday
  const sunday = addDays(todayStr, -dow);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) days.push(addDays(sunday, i));
  return days;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: goal }, { data: profile }] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).maybeSingle<Goal>(),
    supabase
      .from("profiles")
      .select("username, timezone")
      .eq("user_id", user.id)
      .maybeSingle<{ username: string | null; timezone: string | null }>(),
  ]);

  // Username is a forced gate for every account (new or pre-existing) —
  // checked ahead of the goal check since onboarding's own first step is
  // now the username picker.
  if (!profile?.username || !goal) redirect("/onboarding");

  // Prefers the lf_tz cookie (set client-side the moment the page loads —
  // see TimezoneSync.tsx / src/lib/requestTimezone.ts) over the
  // profiles.timezone column, so "today" is correct even for an account
  // whose DB row hasn't picked up a timezone yet.
  const timezone = await resolveUserTimezone(supabase, user.id);
  const todayStr = todayLocal(timezone);
  // ?date=YYYY-MM-DD lets the diary show a past day (the ‹ › arrows below).
  const { date: dateParam } = await searchParams;
  const requested = Array.isArray(dateParam) ? dateParam[0] : dateParam;
  const viewDate = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= todayStr ? requested : todayStr;
  const isToday = viewDate === todayStr;
  const { start, end } = localDayRangeUTC(timezone, viewDate);
  const weekDays = currentWeek(todayStr);
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
    const rows = (weekLogs ?? []).filter(
      (r) => localDateString(new Date(r.logged_at), timezone) === date
    );
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
        <div className="flex items-center gap-1">
          <NotificationsBell />
          <Flame />
        </div>
      </div>

      <div className="mt-7">
        <div className="flex items-baseline justify-between">
          <p className="text-sm text-[#a1a1aa]">{isToday ? "Remaining today" : "Remaining"}</p>
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
        <Link
          href={`/?date=${addDays(viewDate, -1)}`}
          aria-label="Previous day"
          className="px-2 py-1 text-lg text-[#a1a1aa] active:text-emerald-400"
        >
          ‹
        </Link>
        <h2 className="text-sm font-semibold text-[#e4e4e7]">
          {isToday
            ? "Today"
            : new Date(`${viewDate}T12:00:00`).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
        </h2>
        {isToday ? (
          <span className="px-2 py-1 text-lg text-[#3f3f46]">›</span>
        ) : (
          <Link
            href={addDays(viewDate, 1) >= todayStr ? "/" : `/?date=${addDays(viewDate, 1)}`}
            aria-label="Next day"
            className="px-2 py-1 text-lg text-[#a1a1aa] active:text-emerald-400"
          >
            ›
          </Link>
        )}
      </div>

      <MealDiary logs={entries} timezone={timezone} dateStr={viewDate} isToday={isToday} />

      <Link href="/scan/history" className="mt-3 block text-center text-xs font-medium text-[#52525b]">
        View full food log history →
      </Link>

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
