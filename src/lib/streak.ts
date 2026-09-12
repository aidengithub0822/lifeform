// Pure streak/flame/XP logic — no I/O, so it's easy to reason about and test.
//
// Rule (per the product spec): the flame only GROWS on a day where the user
// (a) logged food that day, AND (b) hit at least MIN_GYM_DAYS_PER_WEEK gym
// check-ins in the trailing 7 days (including that day). If a day misses
// either condition, a streak freeze auto-covers it if one is available;
// otherwise the streak resets to 0.

export const MIN_GYM_DAYS_PER_WEEK = 4;
export const XP_PER_STREAK_DAY = 15;
export const XP_PER_FOOD_LOG_OFF_STREAK = 2; // small reward even if the day didn't extend the streak
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

function toDateOnly(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d + "T00:00:00Z") : d;
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function gymCountInTrailingWeek(day: string, workoutDates: Set<string>): number {
  let count = 0;
  for (let i = 0; i < 7; i++) {
    if (workoutDates.has(addDays(day, -i))) count++;
  }
  return count;
}

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  xp: number;
  flameTier: FlameTier;
  freezesAvailable: number;
  frozenDates: string[];
  lastCheckedDate: string | null; // last fully-reconciled past day (never today)
}

export interface ReconcileResult extends StreakState {
  daysBroken: number;
  daysFrozen: number;
  daysGrown: number;
}

/**
 * Walks forward day-by-day from the last checked date through yesterday
 * (today is always left "in progress" and reconciled on a future call),
 * applying the growth/freeze/reset rule to each day.
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

  // First day to evaluate: the day after lastCheckedDate, or 120 days ago if never checked
  // (caps how far back a brand-new account looks).
  let cursor = prior.lastCheckedDate ? addDays(prior.lastCheckedDate, 1) : addDays(todayStr, -120);
  const yesterday = addDays(todayStr, -1);

  while (cursor <= yesterday) {
    const loggedFood = foodDates.has(cursor);
    const gymCount = gymCountInTrailingWeek(cursor, workoutDates);
    const metGrowthBar = loggedFood && gymCount >= MIN_GYM_DAYS_PER_WEEK;

    if (metGrowthBar) {
      currentStreak += 1;
      xp += XP_PER_STREAK_DAY;
      longestStreak = Math.max(longestStreak, currentStreak);
      daysGrown += 1;
    } else if (loggedFood) {
      // Logged food but didn't hit the gym target — small consolation XP,
      // streak doesn't grow but also isn't broken by this alone.
      xp += XP_PER_FOOD_LOG_OFF_STREAK;
      if (freezesAvailable > 0) {
        freezesAvailable -= 1;
        frozenDates.push(cursor);
        daysFrozen += 1;
      } else {
        currentStreak = 0;
        daysBroken += 1;
      }
    } else if (freezesAvailable > 0) {
      // No food logged at all that day — still coverable by a freeze.
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

/** Live (not-yet-locked-in) status for today, shown in the UI before the day ends. */
export function todayStatus(foodDates: Set<string>, workoutDates: Set<string>, todayStr: string) {
  const loggedFoodToday = foodDates.has(todayStr);
  const gymCountThisWeek = gymCountInTrailingWeek(todayStr, workoutDates);
  const onTrackToGrow = loggedFoodToday && gymCountThisWeek >= MIN_GYM_DAYS_PER_WEEK;
  return {
    loggedFoodToday,
    gymCountThisWeek,
    gymTarget: MIN_GYM_DAYS_PER_WEEK,
    onTrackToGrow,
  };
}

export { toDateOnly, addDays };
