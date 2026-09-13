// Per-muscle rank engine — the thing the lift-logging screen exists to feed.
//
// Reuses the same tier ladder (and colors) as the account-level rank in
// rank.ts so the muscle map's palette matches the rest of the app.
//
// A muscle's tier is gated on TWO things at once, so a rank actually means
// something instead of being "for show":
//
// 1. Strength score — how much a lift weighs relative to bodyweight, since
//    lifting more than you weigh is more impressive than lifting less
//    (KIND_BASELINE normalizes across exercise kinds first: a barbell squat
//    and a dumbbell lateral raise move very different fractions of
//    bodyweight for comparable effort, so raw weight/bodyweight isn't
//    comparable across exercises without it).
// 2. Qualifying days — the number of DISTINCT calendar days on which a set
//    hit that tier's score bar. `logged_at` is stamped server-side at
//    insert time (see /api/lifts), so this can't be gamed by logging one
//    big session and calling it done, or by backdating entries — each
//    qualifying day is a real day the user showed up and lifted at that
//    level.
//
// Both gates must clear for a tier to count, and both get harder at higher
// tiers: reaching Bronze can happen after a single genuinely strong lift,
// but climbing from Platinum to Titan requires that same strength sustained
// across ~120 separate qualifying days — which, at a realistic training
// frequency for one muscle, works out to a year or more of real, consistent
// training, not a lucky week.
//
// Core/timed work (planks, ab wheel, etc.) has no meaningful external load
// to score, so it — and any muscle with no near-max weighted sets at all —
// falls back to a pure consistency ladder: qualifying days are just "trained
// this muscle with real volume that day," with the same day-count bar as
// the strength path's top tier.

import { ALL_EXERCISES, type MuscleGroup, type ExerciseKind } from "./trainingSplits";
import { RANK_TIERS, type RankTier } from "./rank";

export const KIND_BASELINE: Record<ExerciseKind, number> = {
  heavy_compound: 1.0,
  moderate_compound: 0.8,
  isolation: 0.35,
  core: 0.2,
};

// Index-aligned with RANK_TIERS (index 0 = newbie, always the floor).
// minScore: bodyweight-relative score (weight / bodyweight / kind baseline)
// a set must reach to count as a "qualifying day" for this tier.
// minQualifyingDays: distinct days that met minScore, required to hold the
// tier — this is the part that forces real elapsed time and consistency.
export const TIER_REQUIREMENTS: { minScore: number; minQualifyingDays: number }[] = [
  { minScore: 0, minQualifyingDays: 0 }, // newbie
  { minScore: 0.35, minQualifyingDays: 1 }, // bronze — one genuinely strong day is enough
  { minScore: 0.55, minQualifyingDays: 3 }, // silver
  { minScore: 0.75, minQualifyingDays: 6 }, // gold
  { minScore: 0.95, minQualifyingDays: 12 }, // platinum
  { minScore: 1.15, minQualifyingDays: 25 }, // diamond
  { minScore: 1.35, minQualifyingDays: 45 }, // champion
  { minScore: 1.55, minQualifyingDays: 70 }, // grand_champion
  { minScore: 1.8, minQualifyingDays: 120 }, // titan — roughly a year+ at a realistic training frequency
];

// Minimum sets in a single day's volume-only fallback (core work, or a
// muscle with no weighted near-max sets) for that day to count as "trained
// with real volume" toward the consistency ladder.
const VOLUME_QUALIFYING_SETS_PER_DAY = 3;

const DEFAULT_BODYWEIGHT_LB = 170;
const MAX_NEAR_MAX_REPS = 8;

export interface LiftForRank {
  lift_name: string;
  weight_lb: number;
  reps: number;
  sets: number;
  logged_at: string;
}

export interface MuscleRankResult {
  muscle: MuscleGroup;
  tier: RankTier;
  score: number;
  bestLift: { name: string; weight_lb: number; reps: number } | null;
  totalSetsLogged: number;
  qualifyingDays: number;
  /** Progress toward the next tier, 0-1 (1 = already there / at the top tier). */
  progress: number;
  nextTier: RankTier | null;
  /** What's currently the bottleneck toward the next tier, for UI copy. */
  limitingFactor: "score" | "days" | null;
  daysNeededForNextTier: number | null;
  scoreNeededForNextTier: number | null;
}

function countQualifyingDays(scoresByDay: Map<string, number>, minScore: number): number {
  let count = 0;
  for (const dayScore of scoresByDay.values()) {
    if (dayScore >= minScore) count++;
  }
  return count;
}

export function computeMuscleRank(
  muscle: MuscleGroup,
  lifts: LiftForRank[],
  bodyweightLb: number | null
): MuscleRankResult {
  const catalogByName = new Map(ALL_EXERCISES.map((e) => [e.name, e]));
  const relevant = lifts.filter((l) => catalogByName.get(l.lift_name)?.muscles.includes(muscle));

  if (relevant.length === 0) {
    return {
      muscle,
      tier: "newbie",
      score: 0,
      bestLift: null,
      totalSetsLogged: 0,
      qualifyingDays: 0,
      progress: 0,
      nextTier: RANK_TIERS[1].tier,
      limitingFactor: "score",
      daysNeededForNextTier: TIER_REQUIREMENTS[1].minQualifyingDays,
      scoreNeededForNextTier: TIER_REQUIREMENTS[1].minScore,
    };
  }

  const totalSetsLogged = relevant.reduce((sum, l) => sum + (l.sets || 0), 0);
  const bw = bodyweightLb && bodyweightLb > 0 ? bodyweightLb : DEFAULT_BODYWEIGHT_LB;

  // Best score reached on each distinct calendar day, from near-max sets.
  const bestScoreByDay = new Map<string, number>();
  let best: { name: string; weight_lb: number; reps: number } | null = null;
  let bestScoreEver = 0;

  for (const lift of relevant) {
    const entry = catalogByName.get(lift.lift_name);
    if (!entry || entry.kind === "core") continue;
    if (lift.reps > MAX_NEAR_MAX_REPS) continue;
    const baseline = KIND_BASELINE[entry.kind];
    const score = lift.weight_lb / bw / baseline;
    if (score > (bestScoreByDay.get(lift.logged_at) ?? 0)) {
      bestScoreByDay.set(lift.logged_at, score);
    }
    if (score > bestScoreEver) {
      bestScoreEver = score;
      best = { name: lift.lift_name, weight_lb: lift.weight_lb, reps: lift.reps };
    }
  }

  const usingVolumeFallback = bestScoreByDay.size === 0;

  // Volume-only fallback: days with enough sets logged for this muscle
  // stand in for "qualifying days," and the score gate is treated as always
  // met (there's no weighted score to check).
  const volumeDaySets = new Map<string, number>();
  if (usingVolumeFallback) {
    for (const lift of relevant) {
      volumeDaySets.set(lift.logged_at, (volumeDaySets.get(lift.logged_at) ?? 0) + (lift.sets || 0));
    }
  }
  function qualifyingDaysForTier(i: number): number {
    if (usingVolumeFallback) {
      let count = 0;
      for (const sets of volumeDaySets.values()) {
        if (sets >= VOLUME_QUALIFYING_SETS_PER_DAY) count++;
      }
      return count;
    }
    return countQualifyingDays(bestScoreByDay, TIER_REQUIREMENTS[i].minScore);
  }

  let achievedIndex = 0;
  for (let i = 1; i < TIER_REQUIREMENTS.length; i++) {
    const req = TIER_REQUIREMENTS[i];
    const scoreOk = usingVolumeFallback || bestScoreEver >= req.minScore;
    const daysOk = qualifyingDaysForTier(i) >= req.minQualifyingDays;
    if (scoreOk && daysOk) achievedIndex = i;
  }

  const tier = RANK_TIERS[achievedIndex].tier;
  const nextIndex = achievedIndex + 1;
  const nextTier = nextIndex < RANK_TIERS.length ? RANK_TIERS[nextIndex].tier : null;

  let progress = 1;
  let limitingFactor: "score" | "days" | null = null;
  let daysNeededForNextTier: number | null = null;
  let scoreNeededForNextTier: number | null = null;

  if (nextIndex < TIER_REQUIREMENTS.length) {
    const req = TIER_REQUIREMENTS[nextIndex];
    const scoreProgress = usingVolumeFallback ? 1 : req.minScore === 0 ? 1 : Math.min(1, bestScoreEver / req.minScore);
    const daysHave = qualifyingDaysForTier(nextIndex);
    const daysProgress = req.minQualifyingDays === 0 ? 1 : Math.min(1, daysHave / req.minQualifyingDays);
    progress = Math.min(scoreProgress, daysProgress);
    limitingFactor = scoreProgress <= daysProgress ? "score" : "days";
    if (!usingVolumeFallback && scoreProgress < 1) scoreNeededForNextTier = req.minScore;
    if (daysProgress < 1) daysNeededForNextTier = Math.max(0, req.minQualifyingDays - daysHave);
  }

  const displayScore = usingVolumeFallback ? Math.min(1.8, totalSetsLogged / 60) : bestScoreEver;

  return {
    muscle,
    tier,
    score: displayScore,
    bestLift: best,
    totalSetsLogged,
    qualifyingDays: usingVolumeFallback ? qualifyingDaysForTier(Math.max(1, achievedIndex)) : bestScoreByDay.size,
    progress,
    nextTier,
    limitingFactor,
    daysNeededForNextTier,
    scoreNeededForNextTier,
  };
}

export function computeAllMuscleRanks(
  muscles: MuscleGroup[],
  lifts: LiftForRank[],
  bodyweightLb: number | null
): MuscleRankResult[] {
  return muscles.map((m) => computeMuscleRank(m, lifts, bodyweightLb));
}

// ---- Rank Calculator helpers -----------------------------------------
//
// Pure, client-safe math backing the "Rank Calculator" tool: given a single
// hypothetical set (exercise kind, weight, bodyweight), what strength tier
// does that set's score reach? This only ever evaluates the SCORE gate —
// the calculator is upfront that hitting a score once starts the clock, but
// the tier itself still needs the qualifying-days history computed above.

export function scoreForLift(kind: ExerciseKind, weightLb: number, bodyweightLb: number): number {
  if (bodyweightLb <= 0) return 0;
  return weightLb / bodyweightLb / KIND_BASELINE[kind];
}

/** Highest tier index (into RANK_TIERS) whose minScore this score clears. */
export function tierIndexForScore(score: number): number {
  let idx = 0;
  for (let i = 1; i < TIER_REQUIREMENTS.length; i++) {
    if (score >= TIER_REQUIREMENTS[i].minScore) idx = i;
  }
  return idx;
}

/** Weight (lb) needed at this bodyweight/kind to reach a given tier's score bar. */
export function weightForTierIndex(index: number, kind: ExerciseKind, bodyweightLb: number): number {
  const req = TIER_REQUIREMENTS[Math.max(0, Math.min(index, TIER_REQUIREMENTS.length - 1))];
  return req.minScore * bodyweightLb * KIND_BASELINE[kind];
}
