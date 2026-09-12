import { reconcileStreak, todayStatus, tierMeta, type StreakState } from "@/lib/streak";

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

/**
 * Reconciles a user's streak up through yesterday, persists it, ensures a
 * widget_token exists, and returns the full state plus today's live status
 * plus display metadata (color/label) — everything either /api/streak or
 * /api/widget needs to hand back to its caller.
 */
export async function loadAndReconcileStreak(supabase: AnySupabase, userId: string) {
  const today = todayUTC();

  const [{ data: streakRow }, { data: foodRows }, { data: workoutRows }] = await Promise.all([
    supabase.from("streaks").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("food_logs")
      .select("logged_at")
      .eq("user_id", userId)
      .gte("logged_at", new Date(Date.now() - 125 * 86400000).toISOString()),
    supabase
      .from("workouts")
      .select("logged_at")
      .eq("user_id", userId)
      .gte("logged_at", new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10)),
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

  const result = reconcileStreak(prior, foodDates, workoutDates, today);
  const widgetToken: string = streakRow?.widget_token ?? randomToken();

  await supabase.from("streaks").upsert({
    user_id: userId,
    current_streak: result.currentStreak,
    longest_streak: result.longestStreak,
    xp: result.xp,
    flame_tier: result.flameTier,
    freezes_available: result.freezesAvailable,
    frozen_dates: result.frozenDates,
    last_checked_date: result.lastCheckedDate,
    widget_token: widgetToken,
    updated_at: new Date().toISOString(),
  });

  const today_status = todayStatus(foodDates, workoutDates, today);
  const meta = tierMeta(result.flameTier);

  return { ...result, today: today_status, widgetToken, tierColor: meta.color, tierLabel: meta.label };
}
