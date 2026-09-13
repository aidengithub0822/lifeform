import { reconcileStreak, growToday, todayStatus, tierMeta, sparkXpForLogNumber, type StreakState } from "@/lib/streak";

// Minimal shape both the authenticated Supabase client and the admin
// (service-role) client satisfy, so this logic can run from either
// /api/streak (cookie session) or /api/widget (token lookup).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function randomToken(): string {
  // 24 random bytes, hex-encoded — unguessable, URL-safe, no padding chars.
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadRawState(supabase: AnySupabase, userId: string) {
  const today = todayUTC();

  const [{ data: streakRow }, { data: foodRows }, { data: workoutRows }] = await Promise.all([
    supabase.from("streaks").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("food_logs")
      .select("logged_at")
      .eq("user_id", userId)
      // Deliberately backdated logs (see counts_for_streak on food_logs)
      // shouldn't be able to retroactively patch a broken streak — only
      // "logged for real, today" activity counts toward the day-activity
      // set streak continuity is computed from.
      .eq("counts_for_streak", true)
      .gte("logged_at", new Date(Date.now() - 125 * 86400000).toISOString()),
    supabase
      .from("workouts")
      .select("logged_at")
      .eq("user_id", userId)
      .gte("logged_at", new Date(Date.now() - 125 * 86400000).toISOString().slice(0, 10)),
  ]);

  const foodDates = new Set<string>(
    (foodRows ?? []).map((r: { logged_at: string }) => String(r.logged_at).slice(0, 10))
  );
  const workoutDates = new Set<string>(
    (workoutRows ?? []).map((r: { logged_at: string }) => String(r.logged_at).slice(0, 10))
  );

  const prior: StreakState = streakRow
    ? {
        currentStreak: streakRow.current_streak,
        longestStreak: streakRow.longest_streak,
        xp: streakRow.xp,
        flameTier: streakRow.flame_tier,
        freezesAvailable: streakRow.freezes_available,
        frozenDates: streakRow.frozen_dates ?? [],
        lastCheckedDate: streakRow.last_checked_date,
      }
    : {
        currentStreak: 0,
        longestStreak: 0,
        xp: 0,
        flameTier: "spark",
        freezesAvailable: 1,
        frozenDates: [],
        lastCheckedDate: null,
      };

  return { today, foodDates, workoutDates, prior, widgetToken: streakRow?.widget_token as string | undefined };
}

async function persist(supabase: AnySupabase, userId: string, state: StreakState, widgetToken: string) {
  await supabase.from("streaks").upsert({
    user_id: userId,
    current_streak: state.currentStreak,
    longest_streak: state.longestStreak,
    xp: state.xp,
    flame_tier: state.flameTier,
    freezes_available: state.freezesAvailable,
    frozen_dates: state.frozenDates,
    last_checked_date: state.lastCheckedDate,
    widget_token: widgetToken,
    updated_at: new Date().toISOString(),
  });
}

/**
 * Reconciles a user's streak: finalizes any past unaccounted days, then
 * immediately finalizes TODAY too if it already qualifies (food logged or
 * workout checked in) — so opening the app right after logging shows the
 * flame already grown, not tomorrow. Persists, ensures a widget_token
 * exists, and returns the full state plus today's live status.
 */
export async function loadAndReconcileStreak(supabase: AnySupabase, userId: string) {
  const { today, foodDates, workoutDates, prior, widgetToken: existingToken } = await loadRawState(supabase, userId);

  const pastReconciled = reconcileStreak(prior, foodDates, workoutDates, today);
  const status = todayStatus(foodDates, workoutDates, today);
  const result = status.grownToday ? growToday(pastReconciled, today) : pastReconciled;

  const widgetToken = existingToken ?? randomToken();
  await persist(supabase, userId, result, widgetToken);

  const meta = tierMeta(result.flameTier);
  return { ...result, today: status, widgetToken, tierColor: meta.color, tierLabel: meta.label };
}

/**
 * Called right after a food log or workout check-in is saved. Reconciles
 * (same as above) and additionally awards escalating "spark" XP for this
 * specific log — the nth qualifying log today earns more than the first.
 * Returns how much XP this call just earned so the caller can show it.
 */
export async function awardSpark(supabase: AnySupabase, userId: string) {
  const { today, foodDates, workoutDates, prior, widgetToken: existingToken } = await loadRawState(supabase, userId);

  const pastReconciled = reconcileStreak(prior, foodDates, workoutDates, today);
  const status = todayStatus(foodDates, workoutDates, today);
  const grew = status.grownToday && pastReconciled.lastCheckedDate !== today;
  const afterGrowth = status.grownToday ? growToday(pastReconciled, today) : pastReconciled;

  // foodDates/workoutDates only track which DAYS had activity (a Set), not
  // how many individual entries — so count today's actual food_log rows
  // separately to know which "log number" this one is for the escalating
  // spark bonus.
  const todayStart = `${today}T00:00:00.000Z`;
  const todayEnd = `${today}T23:59:59.999Z`;
  const [{ count: foodCountToday }, workoutLoggedToday] = await Promise.all([
    supabase
      .from("food_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("logged_at", todayStart)
      .lte("logged_at", todayEnd),
    Promise.resolve(workoutDates.has(today)),
  ]);
  const logsToday = (foodCountToday ?? 0) + (workoutLoggedToday ? 1 : 0);
  const sparkXp = sparkXpForLogNumber(Math.max(logsToday, 1));

  const result: StreakState = { ...afterGrowth, xp: afterGrowth.xp + sparkXp };

  const widgetToken = existingToken ?? randomToken();
  await persist(supabase, userId, result, widgetToken);

  const meta = tierMeta(result.flameTier);
  return {
    xpEarned: sparkXp,
    grewStreakToday: grew,
    totalXp: result.xp,
    currentStreak: result.currentStreak,
    flameTier: result.flameTier,
    tierColor: meta.color,
    tierLabel: meta.label,
  };
}
