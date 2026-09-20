// Split-day templates for the Train setup quiz's three recommended splits.
//
// Rep/set schemes follow mechanical-tension-first hypertrophy programming
// (roughly the Nippard/Sulek-era consensus: heavy compounds in a lower rep
// range near failure, isolations pushed closer to failure at higher reps)
// instead of a blanket "3-4 sets of 10-12" for everything, which is the
// specific complaint that prompted this file. This is a hand-curated
// starting point, not yet AI-personalized — see the coach system prompt
// for the next step of that work.
//
// Each exercise is tagged with the muscle groups it trains, matching the
// muscle-map artboard's regions, so a future lift-logging screen can write
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

export interface SplitExercise {
  name: string;
  kind: ExerciseKind;
  sets: number;
  repRange: string;
  cue: string;
  muscles: MuscleGroup[];
}

export interface SplitDay {
  key: string;
  label: string;
  exercises: SplitExercise[];
}

export interface SplitDefinition {
  key: "upper_lower" | "ppl" | "bro_split";
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

function ex(
  name: string,
  kind: ExerciseKind,
  sets: number,
  repRange: string,
  muscles: MuscleGroup[],
  cue?: string
): SplitExercise {
  return { name, kind, sets, repRange, muscles, cue: cue ?? KIND_CUE[kind] };
}

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
          ex("Barbell bench press", "heavy_compound", 4, "5-8", ["chest", "shoulders", "triceps"]),
          ex("Barbell row", "heavy_compound", 4, "6-8", ["back", "biceps", "traps"]),
          ex("Seated overhead press", "moderate_compound", 3, "8-10", ["shoulders", "triceps"]),
          ex("Lat pulldown", "moderate_compound", 3, "8-10", ["back", "biceps"]),
          ex("Cable lateral raise", "isolation", 3, "12-15", ["shoulders"]),
          ex("Barbell curl", "isolation", 3, "10-12", ["biceps"]),
          ex("Triceps pushdown", "isolation", 3, "12-15", ["triceps"]),
        ],
      },
      {
        key: "lower_a",
        label: "Lower A",
        exercises: [
          ex("Back squat", "heavy_compound", 4, "5-8", ["quads", "glutes"]),
          ex("Romanian deadlift", "heavy_compound", 3, "6-8", ["hamstrings", "glutes", "back"]),
          ex("Leg press", "moderate_compound", 3, "10-12", ["quads", "glutes"]),
          ex("Seated leg curl", "isolation", 3, "12-15", ["hamstrings"]),
          ex("Standing calf raise", "isolation", 4, "12-15", ["calves"]),
          ex("Hanging leg raise", "core", 3, "10-15", ["abs"]),
        ],
      },
      {
        key: "upper_b",
        label: "Upper B",
        exercises: [
          ex("Incline dumbbell press", "heavy_compound", 4, "6-8", ["chest", "shoulders", "triceps"]),
          ex("Pull-ups / weighted pull-ups", "heavy_compound", 4, "6-8", ["back", "biceps"]),
          ex("Machine shoulder press", "moderate_compound", 3, "8-10", ["shoulders", "triceps"]),
          ex("Seated cable row", "moderate_compound", 3, "8-10", ["back", "biceps", "traps"]),
          ex("Cable chest fly", "isolation", 3, "12-15", ["chest"]),
          ex("Rear delt fly", "isolation", 3, "15-20", ["shoulders"]),
          ex("Hammer curl", "isolation", 3, "10-12", ["biceps"]),
          ex("Overhead triceps extension", "isolation", 3, "10-12", ["triceps"]),
        ],
      },
      {
        key: "lower_b",
        label: "Lower B",
        exercises: [
          ex("Conventional deadlift", "heavy_compound", 3, "4-6", ["hamstrings", "glutes", "back", "traps"]),
          ex("Front squat", "heavy_compound", 3, "6-8", ["quads", "glutes"]),
          ex("Walking lunges", "moderate_compound", 3, "10-12 each leg", ["quads", "glutes"]),
          ex("Leg extension", "isolation", 3, "12-15", ["quads"]),
          ex("Hip thrust", "isolation", 3, "10-12", ["glutes"]),
          ex("Seated calf raise", "isolation", 4, "15-20", ["calves"]),
          ex("Cable crunch", "core", 3, "12-15", ["abs"]),
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
          ex("Barbell bench press", "heavy_compound", 4, "5-8", ["chest", "shoulders", "triceps"]),
          ex("Seated overhead press", "heavy_compound", 3, "6-8", ["shoulders", "triceps"]),
          ex("Incline dumbbell press", "moderate_compound", 3, "8-10", ["chest", "shoulders"]),
          ex("Cable lateral raise", "isolation", 4, "12-15", ["shoulders"]),
          ex("Cable chest fly", "isolation", 3, "12-15", ["chest"]),
          ex("Triceps pushdown", "isolation", 3, "12-15", ["triceps"]),
          ex("Overhead triceps extension", "isolation", 2, "10-12", ["triceps"]),
        ],
      },
      {
        key: "pull",
        label: "Pull",
        exercises: [
          ex("Deadlift", "heavy_compound", 3, "4-6", ["back", "hamstrings", "glutes", "traps"]),
          ex("Pull-ups / weighted pull-ups", "heavy_compound", 4, "6-8", ["back", "biceps"]),
          ex("Barbell row", "moderate_compound", 3, "8-10", ["back", "biceps", "traps"]),
          ex("Face pulls", "isolation", 3, "15-20", ["shoulders", "traps"]),
          ex("Barbell curl", "isolation", 3, "10-12", ["biceps"]),
          ex("Hammer curl", "isolation", 3, "10-12", ["biceps"]),
          ex("Dumbbell shrug", "isolation", 3, "12-15", ["traps"]),
        ],
      },
      {
        key: "legs",
        label: "Legs",
        exercises: [
          ex("Back squat", "heavy_compound", 4, "5-8", ["quads", "glutes"]),
          ex("Romanian deadlift", "heavy_compound", 3, "6-8", ["hamstrings", "glutes"]),
          ex("Leg press", "moderate_compound", 3, "10-12", ["quads", "glutes"]),
          ex("Seated leg curl", "isolation", 3, "12-15", ["hamstrings"]),
          ex("Leg extension", "isolation", 3, "12-15", ["quads"]),
          ex("Standing calf raise", "isolation", 4, "12-15", ["calves"]),
          ex("Hanging leg raise", "core", 3, "10-15", ["abs"]),
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
    days: [
      {
        key: "chest",
        label: "Chest",
        exercises: [
          ex("Barbell bench press", "heavy_compound", 4, "5-8", ["chest", "shoulders", "triceps"]),
          ex("Incline dumbbell press", "heavy_compound", 3, "6-8", ["chest", "shoulders"]),
          ex("Cable chest fly", "isolation", 3, "12-15", ["chest"]),
          ex("Dips (chest-leaning)", "moderate_compound", 3, "8-12", ["chest", "triceps"]),
          ex("Push-ups", "isolation", 2, "to near-failure", ["chest", "triceps"]),
        ],
      },
      {
        key: "back",
        label: "Back",
        exercises: [
          ex("Deadlift", "heavy_compound", 3, "4-6", ["back", "hamstrings", "glutes", "traps"]),
          ex("Pull-ups / lat pulldown", "heavy_compound", 4, "6-10", ["back", "biceps"]),
          ex("Barbell row", "moderate_compound", 3, "8-10", ["back", "biceps"]),
          ex("Seated cable row", "isolation", 3, "10-12", ["back", "biceps"]),
          ex("Face pulls", "isolation", 3, "15-20", ["shoulders", "traps"]),
        ],
      },
      {
        key: "shoulders",
        label: "Shoulders",
        exercises: [
          ex("Seated overhead press", "heavy_compound", 4, "6-8", ["shoulders", "triceps"]),
          ex("Cable lateral raise", "isolation", 4, "12-15", ["shoulders"]),
          ex("Rear delt fly", "isolation", 3, "15-20", ["shoulders"]),
          ex("Arnold press", "moderate_compound", 3, "8-10", ["shoulders", "triceps"]),
          ex("Dumbbell shrug", "isolation", 3, "12-15", ["traps"]),
        ],
      },
      {
        key: "arms",
        label: "Arms",
        exercises: [
          ex("Close-grip bench press", "moderate_compound", 4, "8-10", ["triceps", "chest"]),
          ex("Barbell curl", "isolation", 4, "10-12", ["biceps"]),
          ex("Overhead triceps extension", "isolation", 3, "10-12", ["triceps"]),
          ex("Hammer curl", "isolation", 3, "10-12", ["biceps"]),
          ex("Cable tricep pushdown", "isolation", 3, "12-15", ["triceps"]),
          ex("Incline dumbbell curl", "isolation", 3, "12-15", ["biceps"]),
        ],
      },
      {
        key: "legs",
        label: "Legs",
        exercises: [
          ex("Back squat", "heavy_compound", 4, "5-8", ["quads", "glutes"]),
          ex("Romanian deadlift", "heavy_compound", 3, "6-8", ["hamstrings", "glutes"]),
          ex("Leg press", "moderate_compound", 3, "10-12", ["quads", "glutes"]),
          ex("Seated leg curl", "isolation", 3, "12-15", ["hamstrings"]),
          ex("Leg extension", "isolation", 3, "12-15", ["quads"]),
          ex("Standing calf raise", "isolation", 4, "12-15", ["calves"]),
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
  ex("Dumbbell bench press", "heavy_compound", 4, "6-8", ["chest", "shoulders", "triceps"]),
  ex("Machine chest press", "moderate_compound", 3, "8-12", ["chest", "triceps"]),
  ex("Decline bench press", "heavy_compound", 3, "6-8", ["chest", "triceps"]),
  ex("Pec deck", "isolation", 3, "12-15", ["chest"]),
  ex("T-bar row", "moderate_compound", 3, "8-10", ["back", "biceps"]),
  ex("Chest-supported row", "moderate_compound", 3, "8-12", ["back", "biceps"]),
  ex("Single-arm dumbbell row", "moderate_compound", 3, "8-10 each side", ["back", "biceps"]),
  ex("Straight-arm pulldown", "isolation", 3, "12-15", ["back"]),
  ex("Dumbbell lateral raise", "isolation", 4, "12-15", ["shoulders"]),
  ex("Machine shoulder press", "moderate_compound", 3, "8-10", ["shoulders", "triceps"]),
  ex("Cable rear delt row", "isolation", 3, "12-15", ["shoulders", "back"]),
  ex("Preacher curl", "isolation", 3, "10-12", ["biceps"]),
  ex("Cable curl", "isolation", 3, "12-15", ["biceps"]),
  ex("Concentration curl", "isolation", 3, "12-15", ["biceps"]),
  ex("Skull crushers", "isolation", 3, "10-12", ["triceps"]),
  ex("Dumbbell tricep kickback", "isolation", 3, "12-15", ["triceps"]),
  ex("Bulgarian split squat", "moderate_compound", 3, "8-10 each leg", ["quads", "glutes"]),
  ex("Hack squat", "heavy_compound", 3, "6-10", ["quads", "glutes"]),
  ex("Glute bridge", "isolation", 3, "12-15", ["glutes"]),
  ex("Cable pull-through", "isolation", 3, "12-15", ["glutes", "hamstrings"]),
  ex("Lying leg curl", "isolation", 3, "10-12", ["hamstrings"]),
  ex("Sumo deadlift", "heavy_compound", 3, "4-6", ["hamstrings", "glutes", "back"]),
  ex("Calf press on leg press", "isolation", 4, "12-15", ["calves"]),
  ex("Weighted plank", "core", 3, "30-60s", ["abs"]),
  ex("Cable woodchopper", "core", 3, "12-15 each side", ["abs"]),
  ex("Ab wheel rollout", "core", 3, "8-12", ["abs"]),
  // --- Added for the muscle-by-muscle lift browser on /fitness: enough
  // variety in every sub-muscle that the browser lists a full menu of
  // real options (barbell / dumbbell / cable / machine / bodyweight).
  // Chest
  ex("Incline barbell bench press", "heavy_compound", 4, "6-8", ["chest", "shoulders", "triceps"]),
  ex("Incline machine press", "moderate_compound", 3, "8-12", ["chest", "shoulders", "triceps"]),
  ex("Incline dumbbell fly", "isolation", 3, "12-15", ["chest"]),
  ex("Low-to-high cable fly", "isolation", 3, "12-15", ["chest", "shoulders"]),
  ex("Smith machine bench press", "moderate_compound", 3, "8-10", ["chest", "shoulders", "triceps"]),
  ex("Dumbbell fly", "isolation", 3, "12-15", ["chest"]),
  ex("Decline dumbbell press", "moderate_compound", 3, "8-10", ["chest", "triceps"]),
  ex("High-to-low cable fly", "isolation", 3, "12-15", ["chest"]),
  // Back
  ex("Chin-ups", "heavy_compound", 4, "6-10", ["back", "biceps"]),
  ex("Close-grip lat pulldown", "moderate_compound", 3, "8-12", ["back", "biceps"]),
  ex("Neutral-grip lat pulldown", "moderate_compound", 3, "8-12", ["back", "biceps"]),
  ex("Pendlay row", "heavy_compound", 4, "5-8", ["back", "biceps", "traps"]),
  ex("Machine row", "moderate_compound", 3, "8-12", ["back", "biceps"]),
  ex("Inverted row", "moderate_compound", 3, "8-15", ["back", "biceps"]),
  ex("Barbell shrug", "isolation", 3, "10-15", ["traps"]),
  ex("Rack pull", "heavy_compound", 3, "4-6", ["back", "traps", "glutes"]),
  ex("Back extension", "isolation", 3, "10-15", ["back", "glutes", "hamstrings"]),
  ex("Good morning", "moderate_compound", 3, "8-10", ["hamstrings", "back", "glutes"]),
  // Shoulders
  ex("Standing overhead press", "heavy_compound", 4, "5-8", ["shoulders", "triceps"]),
  ex("Dumbbell shoulder press", "moderate_compound", 3, "8-10", ["shoulders", "triceps"]),
  ex("Front raise", "isolation", 3, "12-15", ["shoulders"]),
  ex("Machine lateral raise", "isolation", 3, "12-15", ["shoulders"]),
  ex("Upright row", "moderate_compound", 3, "10-12", ["shoulders", "traps"]),
  ex("Reverse pec deck", "isolation", 3, "12-20", ["shoulders"]),
  ex("Cable rear delt fly", "isolation", 3, "12-20", ["shoulders"]),
  // Arms
  ex("Dumbbell curl", "isolation", 3, "10-12", ["biceps"]),
  ex("EZ-bar curl", "isolation", 3, "8-12", ["biceps"]),
  ex("Spider curl", "isolation", 3, "10-12", ["biceps"]),
  ex("Reverse curl", "isolation", 3, "10-12", ["biceps"]),
  ex("Rope triceps pushdown", "isolation", 3, "12-15", ["triceps"]),
  ex("Cable overhead triceps extension", "isolation", 3, "10-15", ["triceps"]),
  ex("Triceps dips", "moderate_compound", 3, "8-12", ["triceps", "chest", "shoulders"]),
  ex("Diamond push-ups", "isolation", 3, "to near-failure", ["triceps", "chest"]),
  // Legs
  ex("Goblet squat", "moderate_compound", 3, "10-12", ["quads", "glutes"]),
  ex("Smith machine squat", "moderate_compound", 3, "8-10", ["quads", "glutes"]),
  ex("Step-ups", "moderate_compound", 3, "10-12 each leg", ["quads", "glutes"]),
  ex("Reverse lunge", "moderate_compound", 3, "10-12 each leg", ["quads", "glutes"]),
  ex("Cable glute kickback", "isolation", 3, "12-15 each leg", ["glutes"]),
  ex("Hip abduction machine", "isolation", 3, "12-20", ["glutes"]),
  ex("Stiff-leg deadlift", "heavy_compound", 3, "6-10", ["hamstrings", "glutes", "back"]),
  ex("Nordic curl", "isolation", 3, "4-8", ["hamstrings"]),
  ex("Donkey calf raise", "isolation", 4, "12-20", ["calves"]),
  ex("Single-leg calf raise", "isolation", 3, "12-15 each leg", ["calves"]),
  // Abs
  ex("Crunch", "core", 3, "15-20", ["abs"]),
  ex("Decline sit-up", "core", 3, "10-15", ["abs"]),
  ex("Machine crunch", "core", 3, "12-15", ["abs"]),
  ex("Lying leg raise", "core", 3, "10-15", ["abs"]),
  ex("Reverse crunch", "core", 3, "12-15", ["abs"]),
  ex("Captain's chair leg raise", "core", 3, "10-15", ["abs"]),
  ex("Russian twist", "core", 3, "20 total", ["abs"]),
  ex("Side plank", "core", 3, "30-45s each side", ["abs"], "Core — hold a straight line from head to heels. Log the seconds you held as reps."),
  ex("Dumbbell side bend", "core", 3, "12-15 each side", ["abs"]),
  ex("Pallof press", "core", 3, "10-12 each side", ["abs"]),
  ex("Plank", "core", 3, "45-60s", ["abs"], "Core — brace like you're about to be punched. Log the seconds you held as reps."),
  ex("Dead bug", "core", 3, "10-12 each side", ["abs"]),
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
