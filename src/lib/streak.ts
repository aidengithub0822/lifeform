// Pure streak/flame/XP logic — no I/O, so it's easy to reason about and test.
//
// Rule: the flame grows on ANY day you log food OR check in a workout — a
// daily spark, not a weekly quota. If a day has neither, a streak freeze
// auto-covers it if one is available; otherwise the streak resets to 0.
// XP for logging itself is awarded immediately per log (see
// sparkXpForLogNumber), escalating with how many qualifying logs you've
// already done that same day, so logging more earns more.

export const XP_PER_STREAK_DAY = 15; // bonus awarded once, the first time a day is confirmed grown
export const XP_SPARK_BASE = 10; // XP for the 1st qualifying log of the day
export const XP_SPARK_INCREMENT = 5; // extra XP for each additional log that same day
export const XP_SPARK_CAP = 40; // per-log XP never exceeds this, however many logs deep
export const FREEZE_COST_XP = 150;
export const MAX_FREEZES = 3;

export type FlameTier = "spark" | "flame" | "blaze" | "inferno" | "eternal";

export const FLAME_TIERS: { tier: FlameTier; minStreak: number; color: string; label: string }[] = [
  { tier: "spark", minStreak: 0, color: "#a1a1aa", label: "Spark" }, // gray ember — just starting
  { tier: "flame", minStreak: 3, color: "#f97316", label: "Flame" }, // orange
  { tier: "blaze", minStreak: 14, color: "#ef4444", label: "Blaze" }, // red
  { tier: "inferno", minStreak: 45, color: "#3b82f6", label: "Inferno" }, // blue — hottest part of a real flame
  { tier: "eternal", minStreak: 100, color: "#a855f7", label: "Eternal" }, // purple/violet
];

export function tierForStreak(streak: number): FlameTier {
  let current: FlameTier = "spark";
  for (const t of FLAME_TIERS) {
    if (streak >= t.minStreak) current = t.tier;
  }
  return current;
}

export function tierMeta(tier: FlameTier) {
  return FLAME_TIERS.find((t) => t.tier === tier) ?? FLAME_TIERS[0];
}

/** XP for the nth (1-indexed) qualifying log of a single day — escalates, then caps. */
export function sparkXpForLogNumber(n: number): number {
  return Math.min(XP_SPARK_BASE + (Math.max(n, 1) - 1) * XP_SPARK_INCREMENT, XP_SPARK_CAP);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  xp: number;
  flameTier: FlameTier;
  freezesAvailable: number;
  frozenDates: string[];
  lastCheckedDate: string | null; // last day whose growth/freeze/break decision is finalized — CAN be today
}

export interface ReconcileResult extends StreakState {
  daysBroken: number;
  daysFrozen: number;
  daysGrown: number;
}

/**
 * Walks forward day-by-day from the last checked date through yesterday,
 * finalizing each PAST day as grown/frozen/broken. Today is deliberately
 * left alone here — see growToday — since today isn't over yet and
 * shouldn't be marked broken just because nothing's been logged so far.
 */
export function reconcileStreak(
  prior: StreakState,
  foodDates: Set<string>,
  workoutDates: Set<string>,
  todayStr: string
): ReconcileResult {
  let { currentStreak, longestStreak, xp, freezesAvailable } = prior;
  const frozenDates = [...prior.frozenDates];
  let daysBroken = 0;
  let daysFrozen = 0;
  let daysGrown = 0;

  let cursor = prior.lastCheckedDate ? addDays(prior.lastCheckedDate, 1) : addDays(todayStr, -120);
  const yesterday = addDays(todayStr, -1);

  while (cursor <= yesterday) {
    const grown = foodDates.has(cursor) || workoutDates.has(cursor);

    if (grown) {
      currentStreak += 1;
      xp += XP_PER_STREAK_DAY;
      longestStreak = Math.max(longestStreak, currentStreak);
      daysGrown += 1;
    } else if (freezesAvailable > 0) {
      freezesAvailable -= 1;
      frozenDates.push(cursor);
      daysFrozen += 1;
    } else {
      currentStreak = 0;
      daysBroken += 1;
    }

    cursor = addDays(cursor, 1);
  }

  return {
    currentStreak,
    longestStreak,
    xp,
    flameTier: tierForStreak(currentStreak),
    freezesAvailable,
    frozenDates,
    lastCheckedDate: yesterday >= (prior.lastCheckedDate ?? addDays(todayStr, -121)) ? yesterday : prior.lastCheckedDate,
    daysBroken,
    daysFrozen,
    daysGrown,
  };
}

/**
 * Finalizes TODAY as grown, immediately, the first time it qualifies
 * (food logged or workout checked in) — this is what makes the flame
 * "spark" the same day instead of waiting until tomorrow's reconcile.
 * Idempotent: calling it again the same day (already finalized) is a no-op.
 */
export function growToday(prior: StreakState, todayStr: string): StreakState {
  if (prior.lastCheckedDate === todayStr) return prior; // already grown today
  const currentStreak = prior.currentStreak + 1;
  return {
    ...prior,
    currentStreak,
    longestStreak: Math.max(prior.longestStreak, currentStreak),
    xp: prior.xp + XP_PER_STREAK_DAY,
    flameTier: tierForStreak(currentStreak),
    lastCheckedDate: todayStr,
  };
}

/** Live status for today, shown in the UI. */
export function todayStatus(foodDates: Set<string>, workoutDates: Set<string>, todayStr: string) {
  const loggedFoodToday = foodDates.has(todayStr);
  const workoutToday = workoutDates.has(todayStr);
  return {
    loggedFoodToday,
    workoutToday,
    grownToday: loggedFoodToday || workoutToday,
  };
}

export { addDays };
