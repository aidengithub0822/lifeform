// Per-muscle rank engine — the thing the lift-logging screen exists to feed.
//
// Reuses the same tier ladder (and colors) as the account-level rank in
// rank.ts so the muscle map's palette matches the rest of the app, but the
// gate here is different: instead of an absolute lift number gated by
// account age, each muscle's tier comes from a bodyweight-relative strength
// score built from that muscle's own logged sets.
//
// Different exercise kinds move very different fractions of bodyweight for
// the same amount of real muscular effort (a barbell squat vs. a dumbbell
// lateral raise), so raw weight/bodyweight isn't comparable across
// exercises. KIND_BASELINE normalizes for that: a lift's score is
// (weight / bodyweight) / baseline-for-its-kind, so a strong isolation
// lifter and a strong compound lifter can land on the same muscle tier
// fairly. Core/timed work has no meaningful external load to normalize, so
// it — and any muscle with no near-max weighted sets yet — falls back to a
// volume score instead.

import { ALL_EXERCISES, type MuscleGroup, type ExerciseKind } from "./trainingSplits";
import { RANK_TIERS, type RankTier } from "./rank";

const KIND_BASELINE: Record<ExerciseKind, number> = {
  heavy_compound: 1.0,
  moderate_compound: 0.8,
  isolation: 0.35,
  core: 0.2,
};

// Normalized-score cutoff to reach each tier in RANK_TIERS, index-aligned
// (RANK_TIERS[0] is "newbie" and always the floor).
const SCORE_THRESHOLDS = [0, 0.35, 0.55, 0.75, 0.95, 1.15, 1.35, 1.55];

const DEFAULT_BODYWEIGHT_LB = 170;
const MAX_NEAR_MAX_REPS = 8;
const VOLUME_SETS_FOR_MAX_SCORE = 40; // sets logged (all-time) to reach the top of the volume fallback scale

export interface LiftForRank {
  lift_name: string;
  weight_lb: number;
  reps: number;
  sets: number;
}

export interface MuscleRankResult {
  muscle: MuscleGroup;
  tier: RankTier;
  score: number;
  bestLift: { name: string; weight_lb: number; reps: number } | null;
  totalSetsLogged: number;
}

function tierForScore(score: number): RankTier {
  let tier: RankTier = "newbie";
  for (let i = 0; i < SCORE_THRESHOLDS.length; i++) {
    if (score >= SCORE_THRESHOLDS[i]) tier = RANK_TIERS[i].tier;
  }
  return tier;
}

export function computeMuscleRank(
  muscle: MuscleGroup,
  lifts: LiftForRank[],
  bodyweightLb: number | null
): MuscleRankResult {
  const catalogByName = new Map(ALL_EXERCISES.map((e) => [e.name, e]));
  const relevant = lifts.filter((l) => catalogByName.get(l.lift_name)?.muscles.includes(muscle));

  if (relevant.length === 0) {
    return { muscle, tier: "newbie", score: 0, bestLift: null, totalSetsLogged: 0 };
  }

  const totalSetsLogged = relevant.reduce((sum, l) => sum + (l.sets || 0), 0);
  const bw = bodyweightLb && bodyweightLb > 0 ? bodyweightLb : DEFAULT_BODYWEIGHT_LB;

  let best: { name: string; weight_lb: number; reps: number } | null = null;
  let bestScore = 0;

  for (const lift of relevant) {
    const entry = catalogByName.get(lift.lift_name);
    if (!entry || entry.kind === "core") continue;
    if (lift.reps > MAX_NEAR_MAX_REPS) continue;
    const baseline = KIND_BASELINE[entry.kind];
    const score = lift.weight_lb / bw / baseline;
    if (score > bestScore) {
      bestScore = score;
      best = { name: lift.lift_name, weight_lb: lift.weight_lb, reps: lift.reps };
    }
  }

  if (bestScore === 0) {
    const volumeScore = Math.min(1.6, totalSetsLogged / VOLUME_SETS_FOR_MAX_SCORE);
    return { muscle, tier: tierForScore(volumeScore), score: volumeScore, bestLift: null, totalSetsLogged };
  }

  return { muscle, tier: tierForScore(bestScore), score: bestScore, bestLift: best, totalSetsLogged };
}

export function computeAllMuscleRanks(
  muscles: MuscleGroup[],
  lifts: LiftForRank[],
  bodyweightLb: number | null
): MuscleRankResult[] {
  return muscles.map((m) => computeMuscleRank(m, lifts, bodyweightLb));
}
