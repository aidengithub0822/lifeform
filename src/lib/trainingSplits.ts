// Split-day templates for the Train setup quiz's recommended splits.
//
// HYPERTROPHY PHILOSOPHY (why this file looks the way it does):
//
// Mechanical tension — not pump, soreness, sweat, or how many exercises got
// touched — is the primary driver of hypertrophy here. That means this file
// does NOT default every exercise to "3-4 sets," the classic lazy
// prescription: a single well-executed working set per exercise is a fully
// legitimate prescription, and what actually matters is WEEKLY effective
// volume per muscle (see weeklyMuscleVolume in hypertrophyEngine.ts), not
// how many sets get crammed into one session. Extra sets beyond an
// effective amount still help, but with diminishing returns — this file
// intentionally starts most splits at an efficient volume rather than a
// maximal one.
//
// Every exercise below carries metadata beyond the old name/kind/sets/reps:
// a weekly-volume-friendly muscleShares breakdown (primary muscle gets
// "direct" credit, secondary muscles get fractional "indirect" credit — an
// indirect set is never counted as equivalent to a direct one), a
// failureRir band (how close to true failure a prescribed set should go —
// isolation/stable-machine work can go closer to 0 RIR; heavy free-weight
// compounds and hip-hinge/deadlift-pattern lifts should NOT routinely be
// taken to true failure even at low set counts, because the injury/setup
// cost of grinding out a failed heavy rep is much higher than the
// hypertrophy upside), and a lengthenedLoading flag for exercises that load
// the target muscle at a long/stretched position (triceps overhead
// extensions, seated leg curls/RDLs for hamstrings, preacher curls,
// deep-flexion leg presses/squats, calf raises with a real stretch, chest
// press/fly variants with stretch) — not because lengthened partials are
// always superior to full ROM (full ROM stays the default everywhere), but
// because these specific movements shouldn't have their stretched portion
// trimmed away for no reason.
//
// None of this is presented to the user as precise science ("you need
// exactly 9.7 sets/week") — it's internal programming logic that produces a
// sensible starting prescription. See hypertrophyEngine.ts for the actual
// weekly-volume math, RIR-banded set-by-set prescriptions, double
// progression, and the (currently unwired, intentionally so) adaptive
// volume suggestion logic that this metadata feeds.
//
// Each exercise is also tagged with the muscle groups it trains, matching
// the muscle-map artboard's regions, so the lift-logging screen writes
// straight into `lift_muscles` without guessing from free-text names.

export type MuscleGroup =
  | "chest"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "back"
  | "traps"
  | "abs"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "calves";

export type ExerciseKind = "heavy_compound" | "moderate_compound" | "isolation" | "core";
export type Stability = "low" | "moderate" | "high";
export type FatigueCost = "low" | "moderate" | "high";
export type Equipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight";

export interface MuscleShare {
  muscle: MuscleGroup;
  /** "primary" = this exercise directly trains the muscle (full/"direct" weekly-volume credit). "secondary" = meaningfully involved but not the main target (fractional/"indirect" credit — never counted as a full direct set). */
  role: "primary" | "secondary";
  /** Fraction of one working set this muscle gets credited with: primary ≈ 1.0, meaningful secondary ≈ 0.5. A truly minor/stabilizer role isn't listed at all (fraction ≈ 0, so it's simply omitted). */
  fraction: number;
}

export interface SplitExercise {
  name: string;
  kind: ExerciseKind;
  /** WORKING sets only — warm-up sets are a separate concept (see `is_warmup` on the `lifts` table) and never count here or toward weekly volume. */
  sets: number;
  repRange: string;
  repRangeMin: number;
  repRangeMax: number;
  cue: string;
  muscles: MuscleGroup[];
  /** Fractional weekly-volume credit per muscle — see MuscleShare above. */
  muscleShares: MuscleShare[];
  stability: Stability;
  fatigueCost: FatigueCost;
  lengthenedLoading: boolean;
  lengthenedNote?: string;
  /** [floor, ceiling] reps-in-reserve band for this exercise's hardest prescribed set. Lower = closer to true failure. */
  failureRir: [number, number];
  /** Whether this exercise lends itself to clean load-based double progression (vs. e.g. timed core work). */
  progressionFriendly: boolean;
  equipment: Equipment;
}

export interface SplitDay {
  key: string;
  label: string;
  exercises: SplitExercise[];
}

export interface SplitDefinition {
  key: "upper_lower" | "ppl" | "bro_split" | "fbeod";
  label: string;
  daysPerWeek: number;
  summary: string;
  tradeoff: string;
  days: SplitDay[];
}

const KIND_CUE: Record<ExerciseKind, string> = {
  heavy_compound: "Heavy compound — chase progressive overload, 1-2 reps in reserve.",
  moderate_compound: "Moderate compound — control the eccentric, 1 rep in reserve.",
  isolation: "Isolation — full stretch and squeeze, push to 0-1 reps in reserve.",
  core: "Core — quality over speed, hold the brace through the whole set.",
};

// Per-kind defaults for the newer metadata fields, overridable per-exercise
// via `opts` below. These are starting points, not claims of precision.
const KIND_DEFAULT_TRAITS: Record<
  ExerciseKind,
  { stability: Stability; fatigueCost: FatigueCost; failureRir: [number, number]; progressionFriendly: boolean }
> = {
  heavy_compound: { stability: "moderate", fatigueCost: "high", failureRir: [1, 2], progressionFriendly: true },
  moderate_compound: { stability: "moderate", fatigueCost: "moderate", failureRir: [1, 2], progressionFriendly: true },
  isolation: { stability: "high", fatigueCost: "low", failureRir: [0, 1], progressionFriendly: true },
  core: { stability: "high", fatigueCost: "low", failureRir: [0, 1], progressionFriendly: false },
};

/** Pulls numeric bounds out of strings like "6-10" or "10-12 each leg"; falls back to a sensible default for non-numeric ranges like "to near-failure" or timed sets like "30-60s". */
function parseRepRange(repRange: string): [number, number] {
  const match = repRange.match(/(\d+)\s*-\s*(\d+)/);
  if (match) return [Number(match[1]), Number(match[2])];
  const single = repRange.match(/(\d+)/);
  if (single) {
    const n = Number(single[1]);
    return [n, n];
  }
  return [8, 12];
}

/** Rough name-based equipment guess — cosmetic/metadata only, not load-bearing anywhere. */
function guessEquipment(name: string): Equipment {
  const n = name.toLowerCase();
  if (n.includes("dumbbell")) return "dumbbell";
  if (n.includes("cable")) return "cable";
  if (
    n.includes("machine") ||
    n.includes("smith") ||
    n.includes("leg press") ||
    n.includes("hack squat") ||
    n.includes("pec deck") ||
    n.includes("leg extension") ||
    n.includes("seated leg curl") ||
    n.includes("lying leg curl")
  )
    return "machine";
  if (
    n.includes("push-up") ||
    n.includes("pull-up") ||
    n.includes("chin-up") ||
    n.includes("plank") ||
    n.includes("dip") ||
    n.includes("inverted row") ||
    n.includes("nordic") ||
    n.includes("hanging") ||
    n.includes("sit-up") ||
    n.includes("crunch")
  )
    return "bodyweight";
  if (n.includes("barbell") || n.includes("deadlift") || n.includes("squat") || n.includes("row") || n.includes("curl") || n.includes("press") || n.includes("raise"))
    return "barbell";
  return "machine";
}

function ex(
  name: string,
  kind: ExerciseKind,
  sets: number,
  repRange: string,
  muscles: MuscleGroup[],
  opts?: {
    cue?: string;
    muscleShares?: MuscleShare[];
    stability?: Stability;
    fatigueCost?: FatigueCost;
    lengthenedLoading?: boolean;
    lengthenedNote?: string;
    failureRir?: [number, number];
    progressionFriendly?: boolean;
    equipment?: Equipment;
  }
): SplitExercise {
  const traits = KIND_DEFAULT_TRAITS[kind];
  const [repRangeMin, repRangeMax] = parseRepRange(repRange);
  const muscleShares: MuscleShare[] =
    opts?.muscleShares ??
    muscles.map((muscle, i) => ({ muscle, role: i === 0 ? "primary" : "secondary", fraction: i === 0 ? 1.0 : 0.5 }) as MuscleShare);
  return {
    name,
    kind,
    sets,
    repRange,
    repRangeMin,
    repRangeMax,
    muscles,
    muscleShares,
    cue: opts?.cue ?? KIND_CUE[kind],
    stability: opts?.stability ?? traits.stability,
    fatigueCost: opts?.fatigueCost ?? traits.fatigueCost,
    lengthenedLoading: opts?.lengthenedLoading ?? false,
    lengthenedNote: opts?.lengthenedNote,
    failureRir: opts?.failureRir ?? traits.failureRir,
    progressionFriendly: opts?.progressionFriendly ?? traits.progressionFriendly,
    equipment: opts?.equipment ?? guessEquipment(name),
  };
}

// Hip-hinge/deadlift-pattern lifts get a more conservative (further from
// true failure) RIR band than other heavy compounds — grinding one of these
// out near failure risks form breakdown with real injury consequences, for
// relatively little extra hypertrophy upside versus stopping a rep or two
// short.
const HIP_HINGE_RIR: [number, number] = [2, 3];
// A few stable, well-guided machine movements are safe to push closer to
// true failure than a free-weight compound of the same kind would be.
const STABLE_MACHINE_RIR: [number, number] = [0, 1];

/** How many times/week each split's rotation is actually run — used by hypertrophyEngine.ts's weekly-volume math. For FBEOD, "every other calendar day" naturally averages out to ~3.5 sessions/week across a 2-week cycle without any date-aware code. */
export const SPLIT_SESSIONS_PER_WEEK: Record<SplitDefinition["key"], number> = {
  upper_lower: 4,
  ppl: 6,
  bro_split: 5,
  fbeod: 3.5,
};

export const SPLITS: Record<SplitDefinition["key"], SplitDefinition> = {
  upper_lower: {
    key: "upper_lower",
    label: "Upper / Lower",
    daysPerWeek: 4,
    summary:
      "Two upper-body days and two lower-body days, alternating. Each muscle group gets hit twice a week.",
    tradeoff: "The balance most people building muscle respond best to, without needing a gym 6 days a week.",
    days: [
      {
        key: "upper_a",
        label: "Upper A",
        exercises: [
          ex("Barbell bench press", "heavy_compound", 2, "5-8", ["chest", "shoulders", "triceps"]),
          ex("Barbell row", "moderate_compound", 2, "6-8", ["back", "biceps", "traps"]),
          ex("Seated overhead press", "moderate_compound", 1, "8-10", ["shoulders", "triceps"]),
          ex("Lat pulldown", "moderate_compound", 1, "8-10", ["back", "biceps"]),
          ex("Cable lateral raise", "isolation", 1, "12-15", ["shoulders"]),
          ex("Barbell curl", "isolation", 1, "10-12", ["biceps"]),
          ex("Triceps pushdown", "isolation", 1, "12-15", ["triceps"]),
        ],
      },
      {
        key: "lower_a",
        label: "Lower A",
        exercises: [
          ex("Back squat", "heavy_compound", 2, "5-8", ["quads", "glutes"]),
          ex("Romanian deadlift", "heavy_compound", 1, "6-8", ["hamstrings", "glutes", "back"], {
            failureRir: HIP_HINGE_RIR,
            lengthenedLoading: true,
            lengthenedNote: "RDLs load the hamstrings hardest at the bottom, lengthened position — don't cut the stretch short to move more weight.",
          }),
          ex("Leg press", "moderate_compound", 1, "10-12", ["quads", "glutes"], {
            lengthenedLoading: true,
            lengthenedNote: "Letting the sled travel into deep knee flexion (as far as comfortable) loads the quads at a longer muscle length.",
          }),
          ex("Seated leg curl", "isolation", 1, "12-15", ["hamstrings"], {
            lengthenedLoading: true,
            lengthenedNote: "The stretched bottom position is where this exercise does its most useful work for the hamstrings — don't skip it.",
          }),
          ex("Standing calf raise", "isolation", 2, "12-15", ["calves"], {
            lengthenedLoading: true,
            lengthenedNote: "Drop into a real stretch at the bottom of each rep rather than bouncing off a shallow range.",
          }),
          ex("Hanging leg raise", "core", 2, "10-15", ["abs"]),
        ],
      },
      {
        key: "upper_b",
        label: "Upper B",
        exercises: [
          ex("Incline dumbbell press", "heavy_compound", 2, "6-8", ["chest", "shoulders", "triceps"], {
            lengthenedLoading: true,
            lengthenedNote: "The incline angle loads the upper chest at a longer stretch at the bottom — let the dumbbells travel down for real.",
          }),
          ex("Pull-ups / weighted pull-ups", "heavy_compound", 2, "6-8", ["back", "biceps"]),
          ex("Machine shoulder press", "moderate_compound", 1, "8-10", ["shoulders", "triceps"], { failureRir: STABLE_MACHINE_RIR }),
          ex("Seated cable row", "moderate_compound", 1, "8-10", ["back", "biceps", "traps"]),
          ex("Cable chest fly", "isolation", 1, "12-15", ["chest"], {
            lengthenedLoading: true,
            lengthenedNote: "Let the arms open wide for a full stretch across the chest before squeezing back together.",
          }),
          ex("Rear delt fly", "isolation", 1, "15-20", ["shoulders"]),
          ex("Hammer curl", "isolation", 1, "10-12", ["biceps"]),
          ex("Overhead triceps extension", "isolation", 1, "10-12", ["triceps"], {
            lengthenedLoading: true,
            lengthenedNote: "The triceps' long head gets its biggest stretch overhead — this is one of the best exercises for that specific part of the muscle.",
          }),
        ],
      },
      {
        key: "lower_b",
        label: "Lower B",
        exercises: [
          ex("Conventional deadlift", "heavy_compound", 1, "4-6", ["hamstrings", "glutes", "back", "traps"], {
            failureRir: HIP_HINGE_RIR,
          }),
          ex("Front squat", "heavy_compound", 2, "6-8", ["quads", "glutes"], {
            lengthenedLoading: true,
            lengthenedNote: "The more upright torso of a front squat lets the quads reach a deeper, more lengthened position at the bottom.",
          }),
          ex("Walking lunges", "moderate_compound", 1, "10-12 each leg", ["quads", "glutes"]),
          ex("Leg extension", "isolation", 1, "12-15", ["quads"]),
          ex("Hip thrust", "isolation", 1, "10-12", ["glutes"]),
          ex("Seated calf raise", "isolation", 2, "15-20", ["calves"], {
            lengthenedLoading: true,
            lengthenedNote: "Drop into a real stretch at the bottom of each rep rather than bouncing off a shallow range.",
          }),
          ex("Cable crunch", "core", 2, "12-15", ["abs"]),
        ],
      },
    ],
  },
  ppl: {
    key: "ppl",
    label: "Push / Pull / Legs",
    daysPerWeek: 6,
    summary:
      "Pushing muscles, pulling muscles, and legs each get their own day, run twice through the week.",
    tradeoff: "Higher volume and frequency than Upper/Lower — best if you can commit to 6 sessions a week.",
    days: [
      {
        key: "push",
        label: "Push",
        exercises: [
          ex("Barbell bench press", "heavy_compound", 2, "5-8", ["chest", "shoulders", "triceps"]),
          ex("Seated overhead press", "moderate_compound", 1, "6-8", ["shoulders", "triceps"]),
          ex("Incline dumbbell press", "heavy_compound", 1, "8-10", ["chest", "shoulders"], {
            lengthenedLoading: true,
            lengthenedNote: "The incline angle loads the upper chest at a longer stretch at the bottom.",
          }),
          ex("Cable lateral raise", "isolation", 2, "12-15", ["shoulders"]),
          ex("Cable chest fly", "isolation", 1, "12-15", ["chest"], {
            lengthenedLoading: true,
            lengthenedNote: "Let the arms open wide for a full stretch across the chest before squeezing back together.",
          }),
          ex("Triceps pushdown", "isolation", 1, "12-15", ["triceps"]),
          ex("Overhead triceps extension", "isolation", 1, "10-12", ["triceps"], {
            lengthenedLoading: true,
            lengthenedNote: "The triceps' long head gets its biggest stretch overhead.",
          }),
        ],
      },
      {
        key: "pull",
        label: "Pull",
        exercises: [
          ex("Deadlift", "heavy_compound", 1, "4-6", ["back", "hamstrings", "glutes", "traps"], {
            failureRir: HIP_HINGE_RIR,
          }),
          ex("Pull-ups / weighted pull-ups", "heavy_compound", 2, "6-8", ["back", "biceps"]),
          ex("Barbell row", "moderate_compound", 1, "8-10", ["back", "biceps", "traps"]),
          ex("Face pulls", "isolation", 1, "15-20", ["shoulders", "traps"]),
          ex("Barbell curl", "isolation", 1, "10-12", ["biceps"]),
          ex("Hammer curl", "isolation", 1, "10-12", ["biceps"]),
          ex("Dumbbell shrug", "isolation", 1, "12-15", ["traps"]),
        ],
      },
      {
        key: "legs",
        label: "Legs",
        exercises: [
          ex("Back squat", "heavy_compound", 2, "5-8", ["quads", "glutes"]),
          ex("Romanian deadlift", "heavy_compound", 1, "6-8", ["hamstrings", "glutes"], {
            failureRir: HIP_HINGE_RIR,
            lengthenedLoading: true,
            lengthenedNote: "RDLs load the hamstrings hardest at the bottom, lengthened position.",
          }),
          ex("Leg press", "moderate_compound", 1, "10-12", ["quads", "glutes"], {
            lengthenedLoading: true,
            lengthenedNote: "Letting the sled travel into deep knee flexion loads the quads at a longer muscle length.",
          }),
          ex("Seated leg curl", "isolation", 1, "12-15", ["hamstrings"], {
            lengthenedLoading: true,
            lengthenedNote: "The stretched bottom position is where this exercise does its most useful work.",
          }),
          ex("Leg extension", "isolation", 1, "12-15", ["quads"]),
          ex("Standing calf raise", "isolation", 2, "12-15", ["calves"], {
            lengthenedLoading: true,
            lengthenedNote: "Drop into a real stretch at the bottom of each rep.",
          }),
          ex("Hanging leg raise", "core", 1, "10-15", ["abs"]),
        ],
      },
    ],
  },
  bro_split: {
    key: "bro_split",
    label: "Bro Split",
    daysPerWeek: 5,
    summary: "One muscle group per day — chest, back, shoulders, arms, legs.",
    tradeoff: "Each muscle gets a full session of focused volume once a week. Simple to follow, lower frequency.",
    // Lower per-muscle training frequency than the other splits here (once
    // every ~7 days instead of twice or more), so each session carries more
    // per-muscle volume than Upper/Lower or PPL would use for the same
    // movement — that's a deliberate frequency/volume tradeoff, not an
    // oversight.
    days: [
      {
        key: "chest",
        label: "Chest",
        exercises: [
          ex("Barbell bench press", "heavy_compound", 3, "5-8", ["chest", "shoulders", "triceps"]),
          ex("Incline dumbbell press", "heavy_compound", 3, "6-8", ["chest", "shoulders"], {
            lengthenedLoading: true,
            lengthenedNote: "The incline angle loads the upper chest at a longer stretch at the bottom.",
          }),
          ex("Cable chest fly", "isolation", 2, "12-15", ["chest"], {
            lengthenedLoading: true,
            lengthenedNote: "Let the arms open wide for a full stretch before squeezing back together.",
          }),
          ex("Dips (chest-leaning)", "moderate_compound", 2, "8-12", ["chest", "triceps"]),
          ex("Push-ups", "isolation", 2, "to near-failure", ["chest", "triceps"]),
        ],
      },
      {
        key: "back",
        label: "Back",
        exercises: [
          ex("Deadlift", "heavy_compound", 2, "4-6", ["back", "hamstrings", "glutes", "traps"], {
            failureRir: HIP_HINGE_RIR,
          }),
          ex("Pull-ups / lat pulldown", "heavy_compound", 3, "6-10", ["back", "biceps"]),
          ex("Barbell row", "moderate_compound", 3, "8-10", ["back", "biceps"]),
          ex("Seated cable row", "moderate_compound", 2, "10-12", ["back", "biceps"]),
          ex("Face pulls", "isolation", 2, "15-20", ["shoulders", "traps"]),
        ],
      },
      {
        key: "shoulders",
        label: "Shoulders",
        exercises: [
          ex("Seated overhead press", "moderate_compound", 3, "6-8", ["shoulders", "triceps"]),
          ex("Cable lateral raise", "isolation", 3, "12-15", ["shoulders"]),
          ex("Rear delt fly", "isolation", 2, "15-20", ["shoulders"]),
          ex("Arnold press", "moderate_compound", 2, "8-10", ["shoulders", "triceps"]),
          ex("Dumbbell shrug", "isolation", 2, "12-15", ["traps"]),
        ],
      },
      {
        key: "arms",
        label: "Arms",
        exercises: [
          ex("Close-grip bench press", "moderate_compound", 3, "8-10", ["triceps", "chest"]),
          ex("Barbell curl", "isolation", 3, "10-12", ["biceps"]),
          ex("Overhead triceps extension", "isolation", 2, "10-12", ["triceps"], {
            lengthenedLoading: true,
            lengthenedNote: "The triceps' long head gets its biggest stretch overhead.",
          }),
          ex("Hammer curl", "isolation", 2, "10-12", ["biceps"]),
          ex("Cable tricep pushdown", "isolation", 2, "12-15", ["triceps"]),
          ex("Incline dumbbell curl", "isolation", 2, "12-15", ["biceps"], {
            lengthenedLoading: true,
            lengthenedNote: "The incline bench puts the biceps in a stretched position at the bottom of each rep.",
          }),
        ],
      },
      {
        key: "legs",
        label: "Legs",
        exercises: [
          ex("Back squat", "heavy_compound", 3, "5-8", ["quads", "glutes"]),
          ex("Romanian deadlift", "heavy_compound", 2, "6-8", ["hamstrings", "glutes"], {
            failureRir: HIP_HINGE_RIR,
            lengthenedLoading: true,
            lengthenedNote: "RDLs load the hamstrings hardest at the bottom, lengthened position.",
          }),
          ex("Leg press", "moderate_compound", 2, "10-12", ["quads", "glutes"], {
            lengthenedLoading: true,
            lengthenedNote: "Letting the sled travel into deep knee flexion loads the quads at a longer muscle length.",
          }),
          ex("Seated leg curl", "isolation", 2, "12-15", ["hamstrings"], {
            lengthenedLoading: true,
            lengthenedNote: "The stretched bottom position is where this exercise does its most useful work.",
          }),
          ex("Leg extension", "isolation", 2, "12-15", ["quads"]),
          ex("Standing calf raise", "isolation", 3, "12-15", ["calves"], {
            lengthenedLoading: true,
            lengthenedNote: "Drop into a real stretch at the bottom of each rep.",
          }),
        ],
      },
    ],
  },
  // Full Body Every Other Day — trains every muscle on every rotation day
  // via a DIFFERENT specific exercise each time (so the same joint angle
  // isn't hammered every session), keeping per-session volume low (1 set
  // per slot) since each muscle gets trained far more often than on the
  // other splits. Running this "every other calendar day" (no particular
  // weekday required) naturally averages out to ~3.5 sessions/week across
  // any 2-week stretch, which is where SPLIT_SESSIONS_PER_WEEK.fbeod comes
  // from — the app's existing day_index rotation (advanced on each "I
  // trained today" tap) already produces this without any date-aware code.
  fbeod: {
    key: "fbeod",
    label: "Full Body Every Other Day",
    daysPerWeek: 3.5,
    summary: "Every muscle, every ~2 days, with just one working set per exercise — rotate A → B → C → A...",
    tradeoff: "High frequency, low per-session fatigue. Needs consistency (train every other day) more than it needs heavy single sessions.",
    days: [
      {
        key: "fbeod_a",
        label: "Full Body A",
        exercises: [
          ex("Incline machine press", "moderate_compound", 1, "8-12", ["chest", "shoulders", "triceps"], { failureRir: STABLE_MACHINE_RIR }),
          ex("Lat pulldown", "moderate_compound", 1, "8-10", ["back", "biceps"]),
          ex("Seated cable row", "moderate_compound", 1, "8-10", ["back", "biceps", "traps"]),
          ex("Cable lateral raise", "isolation", 1, "12-15", ["shoulders"]),
          ex("Barbell curl", "isolation", 1, "10-12", ["biceps"]),
          ex("Overhead triceps extension", "isolation", 1, "10-12", ["triceps"], {
            lengthenedLoading: true,
            lengthenedNote: "The triceps' long head gets its biggest stretch overhead.",
          }),
          ex("Leg press", "moderate_compound", 1, "10-12", ["quads", "glutes"], {
            lengthenedLoading: true,
            lengthenedNote: "Letting the sled travel into deep knee flexion loads the quads at a longer muscle length.",
          }),
          ex("Romanian deadlift", "heavy_compound", 1, "6-8", ["hamstrings", "glutes", "back"], {
            failureRir: HIP_HINGE_RIR,
            lengthenedLoading: true,
            lengthenedNote: "RDLs load the hamstrings hardest at the bottom, lengthened position — this is a hip-hinge pattern, so it keeps a more conservative RIR floor even at one set.",
          }),
          ex("Standing calf raise", "isolation", 1, "12-15", ["calves"], {
            lengthenedLoading: true,
            lengthenedNote: "Drop into a real stretch at the bottom of each rep.",
          }),
        ],
      },
      {
        key: "fbeod_b",
        label: "Full Body B",
        exercises: [
          ex("Machine chest press", "moderate_compound", 1, "8-12", ["chest", "triceps"], { failureRir: STABLE_MACHINE_RIR }),
          ex("Pull-ups / weighted pull-ups", "heavy_compound", 1, "6-10", ["back", "biceps"]),
          ex("Machine row", "moderate_compound", 1, "8-12", ["back", "biceps"], { failureRir: STABLE_MACHINE_RIR }),
          ex("Dumbbell lateral raise", "isolation", 1, "12-15", ["shoulders"]),
          ex("Hammer curl", "isolation", 1, "10-12", ["biceps"]),
          ex("Triceps pushdown", "isolation", 1, "12-15", ["triceps"]),
          ex("Leg extension", "isolation", 1, "12-15", ["quads"]),
          ex("Seated leg curl", "isolation", 1, "12-15", ["hamstrings"], {
            lengthenedLoading: true,
            lengthenedNote: "The stretched bottom position is where this exercise does its most useful work — unlike the RDL on day A, this is a safe, stable machine movement, so it can go closer to true failure at the same frequency.",
          }),
          ex("Seated calf raise", "isolation", 1, "15-20", ["calves"], {
            lengthenedLoading: true,
            lengthenedNote: "Drop into a real stretch at the bottom of each rep.",
          }),
        ],
      },
      {
        key: "fbeod_c",
        label: "Full Body C",
        exercises: [
          ex("Cable chest fly", "isolation", 1, "12-15", ["chest"], {
            lengthenedLoading: true,
            lengthenedNote: "Let the arms open wide for a full stretch before squeezing back together.",
          }),
          ex("Close-grip lat pulldown", "moderate_compound", 1, "8-12", ["back", "biceps"]),
          ex("Barbell row", "moderate_compound", 1, "8-10", ["back", "biceps", "traps"]),
          ex("Machine lateral raise", "isolation", 1, "12-15", ["shoulders"], { failureRir: STABLE_MACHINE_RIR }),
          ex("Preacher curl", "isolation", 1, "10-12", ["biceps"], {
            lengthenedLoading: true,
            lengthenedNote: "The preacher bench locks the upper arm in place so the biceps gets a real stretch at the bottom.",
          }),
          ex("Skull crushers", "isolation", 1, "10-12", ["triceps"]),
          ex("Hack squat", "heavy_compound", 1, "6-10", ["quads", "glutes"], {
            lengthenedLoading: true,
            lengthenedNote: "The fixed path lets you sit deep into a lengthened quad position safely.",
          }),
          ex("Lying leg curl", "isolation", 1, "10-12", ["hamstrings"]),
          ex("Calf press on leg press", "isolation", 1, "12-15", ["calves"], {
            lengthenedLoading: true,
            lengthenedNote: "Drop into a real stretch at the bottom of each rep.",
          }),
        ],
      },
    ],
  },
};

export function splitFor(key: SplitDefinition["key"]): SplitDefinition {
  return SPLITS[key];
}

/** The day a plan should show today, cycling through the split's day list. */
export function currentDay(splitKey: SplitDefinition["key"], dayIndex: number): SplitDay {
  const split = SPLITS[splitKey];
  return split.days[dayIndex % split.days.length];
}

// Extra exercises beyond what appears in a specific split day — mostly
// machine/cable/dumbbell variants of the same movement patterns, so the log
// screen's picker has real options when someone's gym doesn't have a
// barbell free, or they just want to swap the exact movement they did.
const EXTRA_EXERCISES: SplitExercise[] = [
  ex("Dumbbell bench press", "heavy_compound", 2, "6-8", ["chest", "shoulders", "triceps"]),
  ex("Machine chest press", "moderate_compound", 1, "8-12", ["chest", "triceps"], { failureRir: STABLE_MACHINE_RIR }),
  ex("Decline bench press", "heavy_compound", 2, "6-8", ["chest", "triceps"]),
  ex("Pec deck", "isolation", 1, "12-15", ["chest"]),
  ex("T-bar row", "moderate_compound", 1, "8-10", ["back", "biceps"]),
  ex("Chest-supported row", "moderate_compound", 1, "8-12", ["back", "biceps"]),
  ex("Single-arm dumbbell row", "moderate_compound", 1, "8-10 each side", ["back", "biceps"]),
  ex("Straight-arm pulldown", "isolation", 1, "12-15", ["back"]),
  ex("Dumbbell lateral raise", "isolation", 1, "12-15", ["shoulders"]),
  ex("Machine shoulder press", "moderate_compound", 1, "8-10", ["shoulders", "triceps"], { failureRir: STABLE_MACHINE_RIR }),
  ex("Cable rear delt row", "isolation", 1, "12-15", ["shoulders", "back"]),
  ex("Preacher curl", "isolation", 1, "10-12", ["biceps"], {
    lengthenedLoading: true,
    lengthenedNote: "The preacher bench locks the upper arm in place so the biceps gets a real stretch at the bottom.",
  }),
  ex("Cable curl", "isolation", 1, "12-15", ["biceps"]),
  ex("Concentration curl", "isolation", 1, "12-15", ["biceps"]),
  ex("Skull crushers", "isolation", 1, "10-12", ["triceps"]),
  ex("Dumbbell tricep kickback", "isolation", 1, "12-15", ["triceps"]),
  ex("Bulgarian split squat", "moderate_compound", 1, "8-10 each leg", ["quads", "glutes"], {
    lengthenedLoading: true,
    lengthenedNote: "The rear-foot-elevated position lets the front leg's quad reach a deep, lengthened stretch at the bottom.",
  }),
  ex("Hack squat", "heavy_compound", 1, "6-10", ["quads", "glutes"], {
    lengthenedLoading: true,
    lengthenedNote: "The fixed path lets you sit deep into a lengthened quad position safely.",
  }),
  ex("Glute bridge", "isolation", 1, "12-15", ["glutes"]),
  ex("Cable pull-through", "isolation", 1, "12-15", ["glutes", "hamstrings"]),
  ex("Lying leg curl", "isolation", 1, "10-12", ["hamstrings"]),
  ex("Sumo deadlift", "heavy_compound", 1, "4-6", ["hamstrings", "glutes", "back"], { failureRir: HIP_HINGE_RIR }),
  ex("Calf press on leg press", "isolation", 1, "12-15", ["calves"], {
    lengthenedLoading: true,
    lengthenedNote: "Drop into a real stretch at the bottom of each rep.",
  }),
  ex("Weighted plank", "core", 1, "30-60s", ["abs"]),
  ex("Cable woodchopper", "core", 1, "12-15 each side", ["abs"]),
  ex("Ab wheel rollout", "core", 1, "8-12", ["abs"]),
  // --- Added for the muscle-by-muscle lift browser on /fitness: enough
  // variety in every sub-muscle that the browser lists a full menu of
  // real options (barbell / dumbbell / cable / machine / bodyweight).
  // Chest
  ex("Incline barbell bench press", "heavy_compound", 2, "6-8", ["chest", "shoulders", "triceps"], {
    lengthenedLoading: true,
    lengthenedNote: "The incline angle loads the upper chest at a longer stretch at the bottom.",
  }),
  ex("Incline machine press", "moderate_compound", 1, "8-12", ["chest", "shoulders", "triceps"], { failureRir: STABLE_MACHINE_RIR }),
  ex("Incline dumbbell fly", "isolation", 1, "12-15", ["chest"], {
    lengthenedLoading: true,
    lengthenedNote: "Let the dumbbells travel down into a full stretch before squeezing back up.",
  }),
  ex("Low-to-high cable fly", "isolation", 1, "12-15", ["chest", "shoulders"], {
    lengthenedLoading: true,
    lengthenedNote: "The low-to-high path stretches the lower chest fibers at the bottom of the rep.",
  }),
  ex("Smith machine bench press", "moderate_compound", 1, "8-10", ["chest", "shoulders", "triceps"]),
  ex("Dumbbell fly", "isolation", 1, "12-15", ["chest"], {
    lengthenedLoading: true,
    lengthenedNote: "Let the dumbbells travel down into a full stretch before squeezing back up.",
  }),
  ex("Decline dumbbell press", "moderate_compound", 1, "8-10", ["chest", "triceps"]),
  ex("High-to-low cable fly", "isolation", 1, "12-15", ["chest"], {
    lengthenedLoading: true,
    lengthenedNote: "The high-to-low path stretches the lower/outer chest fibers at the bottom of the rep.",
  }),
  // Back
  ex("Chin-ups", "heavy_compound", 2, "6-10", ["back", "biceps"]),
  ex("Close-grip lat pulldown", "moderate_compound", 1, "8-12", ["back", "biceps"]),
  ex("Neutral-grip lat pulldown", "moderate_compound", 1, "8-12", ["back", "biceps"]),
  ex("Pendlay row", "moderate_compound", 2, "5-8", ["back", "biceps", "traps"]),
  ex("Machine row", "moderate_compound", 1, "8-12", ["back", "biceps"], { failureRir: STABLE_MACHINE_RIR }),
  ex("Inverted row", "moderate_compound", 1, "8-15", ["back", "biceps"]),
  ex("Barbell shrug", "isolation", 1, "10-15", ["traps"]),
  ex("Rack pull", "heavy_compound", 1, "4-6", ["back", "traps", "glutes"], { failureRir: HIP_HINGE_RIR }),
  ex("Back extension", "isolation", 1, "10-15", ["back", "glutes", "hamstrings"]),
  ex("Good morning", "moderate_compound", 1, "8-10", ["hamstrings", "back", "glutes"], { failureRir: HIP_HINGE_RIR }),
  // Shoulders
  ex("Standing overhead press", "moderate_compound", 2, "5-8", ["shoulders", "triceps"]),
  ex("Dumbbell shoulder press", "moderate_compound", 1, "8-10", ["shoulders", "triceps"]),
  ex("Front raise", "isolation", 1, "12-15", ["shoulders"]),
  ex("Machine lateral raise", "isolation", 1, "12-15", ["shoulders"], { failureRir: STABLE_MACHINE_RIR }),
  ex("Upright row", "isolation", 1, "10-12", ["shoulders", "traps"]),
  ex("Reverse pec deck", "isolation", 1, "12-20", ["shoulders"]),
  ex("Cable rear delt fly", "isolation", 1, "12-20", ["shoulders"]),
  // Arms
  ex("Dumbbell curl", "isolation", 1, "10-12", ["biceps"]),
  ex("EZ-bar curl", "isolation", 1, "8-12", ["biceps"]),
  ex("Spider curl", "isolation", 1, "10-12", ["biceps"]),
  ex("Reverse curl", "isolation", 1, "10-12", ["biceps"]),
  ex("Rope triceps pushdown", "isolation", 1, "12-15", ["triceps"]),
  ex("Cable overhead triceps extension", "isolation", 1, "10-15", ["triceps"], {
    lengthenedLoading: true,
    lengthenedNote: "The triceps' long head gets its biggest stretch overhead.",
  }),
  ex("Triceps dips", "moderate_compound", 1, "8-12", ["triceps", "chest", "shoulders"]),
  ex("Diamond push-ups", "isolation", 1, "to near-failure", ["triceps", "chest"]),
  // Legs
  ex("Goblet squat", "moderate_compound", 1, "10-12", ["quads", "glutes"]),
  ex("Smith machine squat", "moderate_compound", 1, "8-10", ["quads", "glutes"]),
  ex("Step-ups", "moderate_compound", 1, "10-12 each leg", ["quads", "glutes"]),
  ex("Reverse lunge", "moderate_compound", 1, "10-12 each leg", ["quads", "glutes"]),
  ex("Cable glute kickback", "isolation", 1, "12-15 each leg", ["glutes"]),
  ex("Hip abduction machine", "isolation", 1, "12-20", ["glutes"]),
  ex("Stiff-leg deadlift", "heavy_compound", 1, "6-10", ["hamstrings", "glutes", "back"], {
    failureRir: HIP_HINGE_RIR,
    lengthenedLoading: true,
    lengthenedNote: "The stiff-leg pattern keeps tension on a lengthened hamstring through the bottom half of the rep.",
  }),
  ex("Nordic curl", "isolation", 1, "4-8", ["hamstrings"], {
    lengthenedLoading: true,
    lengthenedNote: "The lowering portion loads the hamstrings hardest right as they're most stretched — the whole point of this exercise.",
  }),
  ex("Donkey calf raise", "isolation", 1, "12-20", ["calves"], {
    lengthenedLoading: true,
    lengthenedNote: "The forward-leaning position lets the calves stretch deeper at the bottom than a standing raise.",
  }),
  ex("Single-leg calf raise", "isolation", 1, "12-15 each leg", ["calves"], {
    lengthenedLoading: true,
    lengthenedNote: "Drop into a real stretch at the bottom of each rep.",
  }),
  // Abs
  ex("Crunch", "core", 1, "15-20", ["abs"]),
  ex("Decline sit-up", "core", 1, "10-15", ["abs"]),
  ex("Machine crunch", "core", 1, "12-15", ["abs"]),
  ex("Lying leg raise", "core", 1, "10-15", ["abs"]),
  ex("Reverse crunch", "core", 1, "12-15", ["abs"]),
  ex("Captain's chair leg raise", "core", 1, "10-15", ["abs"]),
  ex("Russian twist", "core", 1, "20 total", ["abs"]),
  ex("Side plank", "core", 1, "30-45s each side", ["abs"], {
    cue: "Core — hold a straight line from head to heels. Log the seconds you held as reps.",
  }),
  ex("Dumbbell side bend", "core", 1, "12-15 each side", ["abs"]),
  ex("Plank", "core", 1, "30-60s", ["abs"], {
    cue: "Core — brace like you're about to be punched. Log the seconds you held as reps.",
  }),
  ex("Dead bug", "core", 1, "10-12 each side", ["abs"]),
];

/** Every exercise across every split plus the extras, deduplicated by name — the source list for the lift-logging picker. */
export const ALL_EXERCISES: SplitExercise[] = (() => {
  const byName = new Map<string, SplitExercise>();
  for (const split of Object.values(SPLITS)) {
    for (const day of split.days) {
      for (const exercise of day.exercises) byName.set(exercise.name, exercise);
    }
  }
  for (const exercise of EXTRA_EXERCISES) {
    if (!byName.has(exercise.name)) byName.set(exercise.name, exercise);
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
})();

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: "Chest",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  back: "Back",
  traps: "Traps",
  abs: "Abs",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
};

export const MUSCLE_GROUPS: MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "traps",
  "biceps",
  "triceps",
  "abs",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
];

/** Exercises tagged to a given muscle, for browsing the picker by muscle group. */
export function exercisesForMuscle(muscle: MuscleGroup): SplitExercise[] {
  return ALL_EXERCISES.filter((e) => e.muscles.includes(muscle));
}
