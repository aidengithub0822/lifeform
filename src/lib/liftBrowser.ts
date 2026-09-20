// The muscle-by-muscle lift browser on /fitness: six muscle-group buttons
// (Chest / Back / Shoulders / Arms / Legs / Abs), each opening into
// sub-muscle sections (e.g. Arms -> Biceps, Triceps), each listing every
// exercise for that muscle with inline set logging.
//
// Exercise names here must match ALL_EXERCISES in trainingSplits.ts exactly
// (that catalog is what /api/lifts validates against, and what tags each
// lift to the muscle map). An exercise may appear in more than one section
// when it genuinely trains both (e.g. face pulls -> rear delts + traps).
// `resolveSubsection` drops any name that's missing from the catalog rather
// than crashing, and `unlistedExercises` lets a dev check nothing in the
// catalog is unreachable from the browser.

import { CATEGORIES, type MuscleCategory } from "@/lib/workoutCatalog";
import { ALL_EXERCISES, type SplitExercise } from "@/lib/trainingSplits";

export interface LiftSubsection {
  key: string;
  label: string;
  names: string[];
}

export const LIFT_SUBSECTIONS: Record<MuscleCategory, LiftSubsection[]> = {
  chest: [
    {
      key: "upper",
      label: "Upper chest",
      names: [
        "Incline barbell bench press",
        "Incline dumbbell press",
        "Incline machine press",
        "Incline dumbbell fly",
        "Low-to-high cable fly",
      ],
    },
    {
      key: "mid",
      label: "Mid chest",
      names: [
        "Barbell bench press",
        "Dumbbell bench press",
        "Smith machine bench press",
        "Machine chest press",
        "Dumbbell fly",
        "Cable chest fly",
        "Pec deck",
        "Push-ups",
      ],
    },
    {
      key: "lower",
      label: "Lower chest",
      names: [
        "Decline bench press",
        "Decline dumbbell press",
        "Dips (chest-leaning)",
        "High-to-low cable fly",
      ],
    },
  ],
  back: [
    {
      key: "lats",
      label: "Lats",
      names: [
        "Pull-ups / weighted pull-ups",
        "Pull-ups / lat pulldown",
        "Chin-ups",
        "Lat pulldown",
        "Close-grip lat pulldown",
        "Neutral-grip lat pulldown",
        "Straight-arm pulldown",
      ],
    },
    {
      key: "mid",
      label: "Mid back",
      names: [
        "Barbell row",
        "Pendlay row",
        "T-bar row",
        "Seated cable row",
        "Chest-supported row",
        "Single-arm dumbbell row",
        "Machine row",
        "Inverted row",
      ],
    },
    {
      key: "traps",
      label: "Traps",
      names: ["Dumbbell shrug", "Barbell shrug", "Face pulls", "Upright row", "Rack pull"],
    },
    {
      key: "lower",
      label: "Lower back",
      names: [
        "Deadlift",
        "Conventional deadlift",
        "Sumo deadlift",
        "Rack pull",
        "Back extension",
        "Good morning",
      ],
    },
  ],
  shoulders: [
    {
      key: "front",
      label: "Front delts (presses)",
      names: [
        "Standing overhead press",
        "Seated overhead press",
        "Dumbbell shoulder press",
        "Machine shoulder press",
        "Arnold press",
        "Front raise",
      ],
    },
    {
      key: "side",
      label: "Side delts",
      names: [
        "Cable lateral raise",
        "Dumbbell lateral raise",
        "Machine lateral raise",
        "Upright row",
      ],
    },
    {
      key: "rear",
      label: "Rear delts",
      names: [
        "Rear delt fly",
        "Reverse pec deck",
        "Cable rear delt fly",
        "Cable rear delt row",
        "Face pulls",
      ],
    },
  ],
  arms: [
    {
      key: "biceps",
      label: "Biceps",
      names: [
        "Barbell curl",
        "EZ-bar curl",
        "Dumbbell curl",
        "Hammer curl",
        "Incline dumbbell curl",
        "Preacher curl",
        "Spider curl",
        "Concentration curl",
        "Cable curl",
        "Reverse curl",
      ],
    },
    {
      key: "triceps",
      label: "Triceps",
      names: [
        "Close-grip bench press",
        "Triceps dips",
        "Triceps pushdown",
        "Cable tricep pushdown",
        "Rope triceps pushdown",
        "Overhead triceps extension",
        "Cable overhead triceps extension",
        "Skull crushers",
        "Dumbbell tricep kickback",
        "Diamond push-ups",
      ],
    },
  ],
  legs: [
    {
      key: "quads",
      label: "Quads",
      names: [
        "Back squat",
        "Front squat",
        "Hack squat",
        "Smith machine squat",
        "Goblet squat",
        "Leg press",
        "Leg extension",
        "Bulgarian split squat",
        "Walking lunges",
        "Reverse lunge",
        "Step-ups",
      ],
    },
    {
      key: "glutes",
      label: "Glutes",
      names: [
        "Hip thrust",
        "Glute bridge",
        "Cable pull-through",
        "Cable glute kickback",
        "Hip abduction machine",
        "Bulgarian split squat",
        "Reverse lunge",
        "Walking lunges",
        "Romanian deadlift",
      ],
    },
    {
      key: "hamstrings",
      label: "Hamstrings",
      names: [
        "Romanian deadlift",
        "Stiff-leg deadlift",
        "Seated leg curl",
        "Lying leg curl",
        "Nordic curl",
        "Good morning",
        "Cable pull-through",
        "Sumo deadlift",
      ],
    },
    {
      key: "calves",
      label: "Calves",
      names: [
        "Standing calf raise",
        "Seated calf raise",
        "Calf press on leg press",
        "Donkey calf raise",
        "Single-leg calf raise",
      ],
    },
  ],
  abs: [
    {
      key: "upper",
      label: "Upper abs",
      names: ["Crunch", "Cable crunch", "Machine crunch", "Decline sit-up"],
    },
    {
      key: "lower",
      label: "Lower abs",
      names: [
        "Hanging leg raise",
        "Captain's chair leg raise",
        "Lying leg raise",
        "Reverse crunch",
        "Ab wheel rollout",
      ],
    },
    {
      key: "obliques",
      label: "Obliques",
      names: ["Cable woodchopper", "Russian twist", "Dumbbell side bend", "Side plank", "Pallof press"],
    },
    {
      key: "core",
      label: "Core stability",
      names: ["Plank", "Weighted plank", "Dead bug"],
    },
  ],
};

const BY_NAME = new Map(ALL_EXERCISES.map((e) => [e.name, e]));

/** The subsection's exercises, in the order listed, skipping any name the catalog doesn't know. */
export function resolveSubsection(sub: LiftSubsection): SplitExercise[] {
  const out: SplitExercise[] = [];
  for (const name of sub.names) {
    const found = BY_NAME.get(name);
    if (found) out.push(found);
  }
  return out;
}

/** Catalog exercises that no browser section lists — should stay empty. */
export function unlistedExercises(): SplitExercise[] {
  const listed = new Set<string>();
  for (const subs of Object.values(LIFT_SUBSECTIONS)) {
    for (const sub of subs) for (const n of sub.names) listed.add(n);
  }
  return ALL_EXERCISES.filter((e) => !listed.has(e.name));
}

export { CATEGORIES };
export type { MuscleCategory };
