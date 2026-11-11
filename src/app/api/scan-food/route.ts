import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Goal } from "@/lib/types";
import { geminiGenerateJSON, explainAiError, type GeminiPart } from "@/lib/ai";

const SCORE_SCHEMA = {
  type: "object" as const,
  properties: {
    food_name: { type: "string", description: "Short name, e.g. 'Grilled chicken breast with rice and broccoli'" },
    description: { type: "string", description: "1 sentence describing what's on the plate/in the photo" },
    estimated_servings_note: {
      type: "string",
      description: "Brief note on portion size assumptions, e.g. 'assumed ~8oz chicken, 1.5 cups rice'",
    },
    calories: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    score: {
      type: "number",
      description: "0-100 quality score for THIS user's current goal phase, 100 = ideal choice for their goal",
    },
    score_reason: {
      type: "string",
      description: "2-3 sentences explaining the score: what's good, what's not, specific to the user's goal phase",
    },
  },
  required: ["food_name", "description", "calories", "protein_g", "carbs_g", "fat_g", "score", "score_reason"],
};

function goalContext(goal: Goal | null): string {
  if (!goal) {
    return "The user hasn't set specific goals yet. Score generally for balanced nutrition and note they should set goals in the app.";
  }
  if (goal.phase === "bulk") {
    return `The user is in a LEAN BULK phase trying to gain muscle/size (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day). They explicitly do NOT want a restrictive "clean bulk" — calorie-dense foods like burgers, pizza, pasta, rice, and potatoes are fine and often GOOD scores here if they bring solid protein and reasonable calories, not just empty junk. Score high (80-100) for protein-dense, calorie-adequate meals even if not "clean" (e.g. a burger with a side, chicken tenders with rice). Score foods low mainly if they're protein-poor for their calorie load (e.g. just candy, soda, fries alone with nothing else) or if the portion is too small to help a bulk. Do not penalize a food just for being "unhealthy" in a cutting sense — this user needs to eat MORE, consistently.`;
  }
  if (goal.phase === "cut") {
    return `The user is in a CUTTING phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day). Favor high-protein, high-volume, lower-calorie-density foods. Score down foods that are calorie-dense but low protein/low satiety.`;
  }
  return `The user is in a MAINTENANCE phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day). Favor balanced, protein-adequate meals.`;
}

export async function POST(request: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing GEMINI_API_KEY. Add it in your deployment's environment variables." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Couldn't read that request. Try again." }, { status: 400 });
  }
  const { imageBase64, mediaType, note, foodDescription, hasLabel } = (body ?? {}) as {
    imageBase64?: string;
    mediaType?: string;
    note?: string;
    foodDescription?: string;
    hasLabel?: boolean;
  };

  if (!imageBase64 && !foodDescription?.trim()) {
    return NextResponse.json({ error: "No image or description provided" }, { status: 400 });
  }

  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Two entry paths: a photo (vision) or a typed description (text-only).
  // Both use the same schema so the rest of the app doesn't need to care
  // which one produced a given log.
  const parts: GeminiPart[] = imageBase64
    ? [
        { inlineData: { data: imageBase64, mimeType: mediaType || "image/jpeg" } },
        {
          text: `Identify the food in this photo and estimate its nutrition. ${
            hasLabel
              ? "The user says a printed nutrition facts label is visible in this photo — read its exact printed values (calories, protein, carbs, fat, serving size) directly off the label instead of estimating by eye. If the label shows a serving size different from what's actually being eaten (e.g. the label is 'per 1 cup' but the photo shows 2 cups), scale the label's numbers accordingly and say so in estimated_servings_note."
              : "No nutrition label was indicated — estimate nutrition visually from the photo as usual."
          } ${goalContext(goal as Goal | null)}${note ? ` The user added this note: "${note}".` : ""} Give your best realistic estimate even with visual uncertainty — state assumptions in estimated_servings_note rather than refusing to estimate.`,
        },
      ]
    : [
        {
          text: `The user typed in a description of what they ate (no photo): "${foodDescription}". Estimate its nutrition. ${goalContext(
            goal as Goal | null
          )} Give your best realistic estimate from the description, assuming a typical/reasonable portion when it isn't specified — state that assumption in estimated_servings_note rather than refusing to estimate.`,
        },
      ];

  try {
    const input = await geminiGenerateJSON<Record<string, unknown>>({
      parts,
      schema: SCORE_SCHEMA,
      maxOutputTokens: 1024,
    });

    // The database enforces score 0-100 and non-null numbers, so a model that
    // returns 105 or a missing field would otherwise fail the save later with
    // a cryptic constraint error. Normalize here instead.
    const num = (v: unknown, min: number, max: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
    };
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const fallbackName = foodDescription?.trim().slice(0, 80) || "Meal";
    return NextResponse.json({
      food_name: String(input.food_name || fallbackName).slice(0, 200),
      description: String(input.description ?? ""),
      estimated_servings_note: input.estimated_servings_note ? String(input.estimated_servings_note) : undefined,
      calories: Math.round(num(input.calories, 0, 20000)),
      protein_g: round1(num(input.protein_g, 0, 2000)),
      carbs_g: round1(num(input.carbs_g, 0, 3000)),
      fat_g: round1(num(input.fat_g, 0, 2000)),
      score: Math.round(num(input.score, 0, 100)),
      score_reason: String(input.score_reason ?? ""),
    });
  } catch (err) {
    console.error("scan-food failed:", err);
    const { status, message } = explainAiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
