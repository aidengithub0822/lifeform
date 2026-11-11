// Core hypertrophy-programming logic: weekly volume accounting, RIR-banded
// set prescriptions, the plain-English copy shown on the workout screen,
// and double-progression recommendations. Pure, testable functions — see
// scripts/test-hypertrophy-engine.ts.
//
// Deliberately honest about what this file does and doesn't claim:
// - No fake precision. Nothing here tells a user they need "exactly 9.7
//   sets/week" — weeklyMuscleVolume produces a real number, but copy that
//   surfaces it (explainPrescription) always frames it as a starting point,
//   not a scientific requirement.
// - adaptiveVolumeSuggestion is a real, callable function, but it is NOT
//   wired to any automatic UI trigger yet — the app doesn't currently
//   collect the soreness/motivation/recovery feedback it would need to run
//   itself. It's here so that feature has a real algorithm to call into
//   once that feedback collection exists, instead of needing another
//   from-scratch design pass later.

import {
  SPLITS,
  SPLIT_SESSIONS_PER_WEEK,
  type SplitDefinition,
  type SplitExercise,
  type MuscleGroup,
} from "./trainingSplits";

// ---------------------------------------------------------------------------
// Weekly volume
// ---------------------------------------------------------------------------

export interface MuscleWeeklyVolume {
  /** Weekly sets from exercises where this muscle is the PRIMARY target. */
  direct: number;
  /** Weekly sets credited fractionally from exercises where this muscle is a meaningful secondary mover — never counted as equivalent to a direct set. */
  secondary: number;
  /** direct + secondary. */
  total: number;
}

function emptyVolume(): MuscleWeeklyVolume {
  return { direct: 0, secondary: 0, total: 0 };
}

/**
 * One formula handles every split shape uniformly: a split where a muscle
 * appears on only SOME rotation days (Upper/Lower, PPL, Bro Split) and a
 * split where a muscle appears on EVERY rotation day via a different
 * specific exercise each time (FBEOD) both fall out of the same
 * `sessionsPerWeek / distinctRotationDays` frequency applied per day.
 */
export function weeklyMuscleVolume(splitKey: SplitDefinition["key"]): Record<MuscleGroup, MuscleWeeklyVolume> {
  const split = SPLITS[splitKey];
  const perDayFrequency = SPLIT_SESSIONS_PER_WEEK[splitKey] / split.days.length;
  const result = {} as Record<MuscleGroup, MuscleWeeklyVolume>;
  for (const day of split.days) {
    for (const exercise of day.exercises) {
      for (const share of exercise.muscleShares) {
        const vol = result[share.muscle] ?? (result[share.muscle] = emptyVolume());
        const weeklySets = exercise.sets * share.fraction * perDayFrequency;
        if (share.role === "primary") vol.direct += weeklySets;
        else vol.secondary += weeklySets;
        vol.total += weeklySets;
      }
    }
  }
  return result;
}

export function weeklyVolumeForMuscle(splitKey: SplitDefinition["key"], muscle: MuscleGroup): MuscleWeeklyVolume {
  return weeklyMuscleVolume(splitKey)[muscle] ?? emptyVolume();
}

// Rough, non-precise landmarks for "how much weekly volume is this,
// roughly" — used only for copy/UI banding, never shown to users as exact
// thresholds. Additional sets beyond an effective amount still help, just
// with diminishing returns — these bands are not a claim that "high" is
// better than "low," only a description of where a number falls.
export const WEEKLY_VOLUME_LANDMARK_SETS = { low: 6, moderate: 12, high: 20 };
export type VolumeBand = "low" | "moderate" | "high" | "very_high";

export function volumeBand(totalWeeklySets: number): VolumeBand {
  if (totalWeeklySets < WEEKLY_VOLUME_LANDMARK_SETS.low) return "low";
  if (totalWeeklySets < WEEKLY_VOLUME_LANDMARK_SETS.moderate) return "moderate";
  if (totalWeeklySets < WEEKLY_VOLUME_LANDMARK_SETS.high) return "high";
  return "very_high";
}

// ---------------------------------------------------------------------------
// RIR / failure prescriptions
// ---------------------------------------------------------------------------

export interface SetPrescription {
  setNumber: number;
  rir: [number, number];
}

/**
 * A single prescribed set goes straight to the exercise's failure-RIR band
 * (its hardest, most productive effort). With multiple sets, earlier sets
 * stay a little easier (RIR floor/ceiling both +1) and build toward the
 * final set, which hits the true prescribed band — so the exercise still
 * ends on its hardest, most productive set without every set being an
 * all-out grind.
 */
export function prescribeSetRirs(exercise: SplitExercise): SetPrescription[] {
  const n = Math.max(1, exercise.sets);
  const [floor, ceil] = exercise.failureRir;
  const out: SetPrescription[] = [];
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    out.push({ setNumber: i + 1, rir: isLast ? [floor, ceil] : [floor + 1, ceil + 1] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// User-facing explanation copy
// ---------------------------------------------------------------------------

export interface ExercisePrescriptionCopy {
  setsLabel: string;
  repsLabel: string;
  rirLabel: string;
  volumeExplanation: string;
  effortCue: string;
}

/**
 * Short, plain-English copy for the workout screen: a one-line
 * sets/reps/RIR summary for the collapsed view, plus longer "why" copy for
 * an expanded/info view — kept separate so the default screen stays simple
 * ("Incline Chest Press / 1 working set / 8-12 reps / Target: 0-1 RIR")
 * rather than a sports-science dashboard every time.
 */
export function explainPrescription(
  exercise: SplitExercise,
  splitKey: SplitDefinition["key"],
  muscle: MuscleGroup
): ExercisePrescriptionCopy {
  const prescriptions = prescribeSetRirs(exercise);
  const lastRir = prescriptions[prescriptions.length - 1].rir;

  const setsLabel = `${exercise.sets} working ${exercise.sets === 1 ? "set" : "sets"}`;
  const repsLabel = `${exercise.repRangeMin}-${exercise.repRangeMax} reps`;
  const rirLabel = lastRir[0] === lastRir[1] ? `Target: ${lastRir[0]} RIR` : `Target: ${lastRir[0]}-${lastRir[1]} RIR`;

  const volume = weeklyVolumeForMuscle(splitKey, muscle);
  const roundedTotal = Math.round(volume.total * 10) / 10;
  const roundedDirect = Math.round(volume.direct * 10) / 10;

  const volumeExplanation =
    exercise.sets === 1
      ? `You're training ${muscle} frequently on this split, so today uses one high-effort set. Across the week this split works out to roughly ${roundedTotal} total sets for ${muscle} — Lifeform manages your total weekly volume rather than maximizing sets in a single workout.`
      : `This split works out to roughly ${roundedTotal} weekly sets for ${muscle} (about ${roundedDirect} direct). Extra sets can help, but with diminishing returns — this is a deliberately efficient starting point, not a hard ceiling.`;

  const effortCue =
    lastRir[0] <= 0
      ? "Take this set close to failure — you shouldn't have another clean rep left in the tank afterward."
      : `Stop approximately ${lastRir[0]} rep${lastRir[0] === 1 ? "" : "s"} before failure. The goal is a high-quality working set, not just fatigue.`;

  return { setsLabel, repsLabel, rirLabel, volumeExplanation, effortCue };
}

// ---------------------------------------------------------------------------
// Double progression
// ---------------------------------------------------------------------------

export interface LiftHistoryEntry {
  weight_lb: number;
  reps: number;
  rir: number | null;
  logged_at: string;
}

export type ProgressionAction = "increase_load" | "add_rep" | "hold" | "reduce_load";

export interface ProgressionRecommendation {
  action: ProgressionAction;
  note: string;
  suggestedWeightLb?: number;
}

// How much to add when a load increase is recommended. Core/timed work has
// no meaningful load knob, so it progresses by reps/time instead.
const LOAD_STEP_LB: Record<SplitExercise["kind"], number> = {
  heavy_compound: 5,
  moderate_compound: 5,
  isolation: 2.5,
  core: 0,
};

/**
 * Classic double progression: once the TOP of the prescribed rep range is
 * reached at (or below) the exercise's target effort, recommend a load
 * increase and expect reps to reset toward the bottom of the range next
 * time — otherwise, keep building reps at the same weight. Uses only the
 * most recent logged entry for this exercise; a caller with less than one
 * entry gets `null` (nothing to recommend yet).
 */
export function recommendProgression(exercise: SplitExercise, history: LiftHistoryEntry[]): ProgressionRecommendation | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  const last = sorted[sorted.length - 1];
  const [floor, ceil] = exercise.failureRir;

  const atOrAboveRepCeiling = last.reps >= exercise.repRangeMax;
  const atOrBelowRepFloor = last.reps <= exercise.repRangeMin;
  // "At target effort" = logged RIR is at or below the exercise's floor+1 —
  // close enough to the prescribed effort to trust the rep count. A caller
  // with no logged RIR (legacy rows) is treated as having met the effort
  // bar, since reps-only is the best signal available.
  const atTargetEffort = last.rir == null || last.rir <= floor + 1;
  const muchEasierThanTarget = last.rir != null && last.rir > ceil + 1;

  if (atOrAboveRepCeiling && atTargetEffort) {
    const step = LOAD_STEP_LB[exercise.kind];
    if (step > 0) {
      return {
        action: "increase_load",
        note: `You hit the top of the rep range at your target effort — add ${step}lb next time and expect reps to reset toward the bottom of the range.`,
        suggestedWeightLb: Math.round((last.weight_lb + step) * 10) / 10,
      };
    }
    return {
      action: "add_rep",
      note: "You hit the top of the rep range at your target effort — this exercise isn't a load-progression one, so push for even more reps or hold here.",
    };
  }

  if (muchEasierThanTarget) {
    return {
      action: "hold",
      note: "That set looked easier than the prescribed effort — keep the same weight next time, but push closer to the target RIR.",
    };
  }

  if (atOrBelowRepFloor && atTargetEffort && last.rir != null) {
    return {
      action: "hold",
      note: "You're already at the bottom of the rep range at your target effort — this may be a touch heavy. Hold the weight and focus on adding reps before adding more load.",
    };
  }

  if (!atOrAboveRepCeiling) {
    return {
      action: "add_rep",
      note: "Still room in the rep range — aim to add a rep or two at the same weight before increasing load.",
    };
  }

  return { action: "hold", note: "Keep the same weight and effort next session." };
}

// ---------------------------------------------------------------------------
// Adaptive volume (algorithm exists; not yet wired to an automatic trigger
// — see file header)
// ---------------------------------------------------------------------------

export interface AdaptiveVolumeSignals {
  progressingOnLoadOrReps: boolean;
  recoveryFeelsGood: boolean;
  motivationGood: boolean;
  performanceDropped: boolean;
  excessiveSorenessOrJointPain: boolean;
}

export type AdaptiveVolumeAction = "hold" | "increase_one_set" | "decrease_one_set";

export function adaptiveVolumeSuggestion(signals: AdaptiveVolumeSignals): { action: AdaptiveVolumeAction; note: string } {
  if (signals.performanceDropped || signals.excessiveSorenessOrJointPain || !signals.motivationGood) {
    return {
      action: "decrease_one_set",
      note: "Performance, soreness, or motivation signals suggest backing off a set before adding more work — recovery comes first.",
    };
  }
  if (signals.progressingOnLoadOrReps && signals.recoveryFeelsGood) {
    return {
      action: "hold",
      note: "Progress is happening and recovery feels fine — no need to add volume just because it's available. Keep training hard at the current volume.",
    };
  }
  if (!signals.progressingOnLoadOrReps && signals.recoveryFeelsGood) {
    return {
      action: "increase_one_set",
      note: "Progress has stalled but recovery and technique look fine — a small, gradual volume increase (one more set) is a reasonable next step.",
    };
  }
  return { action: "hold", note: "Nothing points clearly toward more or less volume right now — hold steady and keep tracking." };
}
