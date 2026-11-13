// AI classification for a user-typed lift that isn't in the static
// ALL_EXERCISES catalog (the "type your lift" flow on /fitness — see
// src/app/api/lifts/custom/route.ts). One quick Groq text call decides:
//
//   - which of the 11 tracked muscle groups it actually trains
//   - its ExerciseKind, which is what the muscle-rank engine uses to decide
//     what counts as a strong weight for THIS lift (see KIND_BASELINE in
//     muscleRank.ts) — this is the part that makes "10-15lb on a hard
//     isolation move" score fairly instead of looking weak next to a
//     compound lift
//   - a one-line, human-readable note on why, shown back to the person who
//     typed it
//
// Deliberately a single small structured call (same forced-tool-call JSON
// pattern as estimate-recipe/recommend-foods) — nothing heavier, so a brand
// new lift name never feels laggy to submit.
import { groqGenerateJSON, explainAiError } from "@/lib/ai";
import { MUSCLE_GROUPS, type MuscleGroup, type ExerciseKind } from "@/lib/trainingSplits";

const EXERCISE_KINDS: ExerciseKind[] = ["heavy_compound", "moderate_compound", "isolation", "core"];

export interface LiftClassification {
  muscles: MuscleGroup[];
  kind: ExerciseKind;
  difficultyNote: string;
}

const CLASSIFY_SCHEMA = {
  type: "object" as const,
  properties: {
    muscles: {
      type: "array",
      items: { type: "string", enum: MUSCLE_GROUPS },
      description: "Every muscle group this lift meaningfully trains. Almost always 1-2, rarely 3.",
    },
    kind: {
      type: "string",
      enum: EXERCISE_KINDS,
      description:
        "heavy_compound = big multi-joint barbell-type lift most people lift close to or over bodyweight on (squat, deadlift, bench). " +
        "moderate_compound = multi-joint but lighter relative to bodyweight (rows, presses on machines/dumbbells). " +
        "isolation = single-joint, one muscle, light absolute weight is normal and can still be a hard, impressive effort (curls, extensions, raises, Bayesian-style cable work). " +
        "core = ab/core work, usually bodyweight or timed rather than meaningfully external-loaded.",
    },
    difficulty_note: {
      type: "string",
      description:
        "One short sentence, written for the lifter: how hard this specific lift is and what that means for judging the weight they use on it " +
        "(e.g. 'Bayesian curls are a demanding single-joint biceps isolation move done under constant tension — even 10-15lb is a solid working weight, not a weak one.').",
    },
  },
  required: ["muscles", "kind", "difficulty_note"],
};

export async function classifyLift(name: string): Promise<LiftClassification> {
  const result = await groqGenerateJSON<{ muscles: string[]; kind: string; difficulty_note: string }>({
    toolName: "classify_lift",
    toolDescription:
      "Classify a weightlifting exercise by which muscles it trains, how physically demanding it is relative to the weight typically used, and a one-line difficulty note.",
    schema: CLASSIFY_SCHEMA,
    maxTokens: 400,
    systemPrompt:
      "You're a strength coach classifying a gym exercise a user typed in by hand. Answer only from your own knowledge of how the exercise is actually performed — never ask a follow-up question.",
    prompt: `Classify this exercise: "${name}"`,
  });

  const muscles = (result.muscles ?? []).filter((m): m is MuscleGroup => MUSCLE_GROUPS.includes(m as MuscleGroup));
  const kind = EXERCISE_KINDS.includes(result.kind as ExerciseKind) ? (result.kind as ExerciseKind) : "isolation";
  if (muscles.length === 0) {
    throw new Error("Couldn't figure out which muscle that lift trains — try a more specific name.");
  }

  return {
    muscles,
    kind,
    difficultyNote: (result.difficulty_note || "").trim().slice(0, 300),
  };
}

export { explainAiError };
