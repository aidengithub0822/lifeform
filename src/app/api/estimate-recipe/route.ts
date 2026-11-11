import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Goal } from "@/lib/types";
import { groqGenerateJSON, explainAiError } from "@/lib/ai";

const ESTIMATE_SCHEMA = {
  type: "object" as const,
  properties: {
    total_calories: { type: "number", description: "Total calories for the entire recipe, all servings combined" },
    total_protein_g: { type: "number" },
    total_carbs_g: { type: "number" },
    total_fat_g: { type: "number" },
    recommended_servings: {
      type: "number",
      description: "Whole number of servings to split this recipe into so each serving fits the user's goal well",
    },
    serving_note: {
      type: "string",
      description:
        "1-2 sentences explaining the recommended serving size in terms of this user's specific goal (e.g. calories/protein per serving vs. their targets)",
    },
  },
  required: [
    "total_calories",
    "total_protein_g",
    "total_carbs_g",
    "total_fat_g",
    "recommended_servings",
    "serving_note",
  ],
};

function goalContext(goal: Goal | null): string {
  if (!goal) {
    return "The user hasn't set specific goals yet. Recommend a generally sensible serving size.";
  }
  if (goal.phase === "bulk") {
    return `The user is in a LEAN BULK phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day, eating ~3-4 meals/day). Recommend a serving size that's calorie-dense and protein-rich per serving — don't recommend splitting it into so many small servings that each one is too small to meaningfully contribute to a bulk.`;
  }
  if (goal.phase === "cut") {
    return `The user is in a CUTTING phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day). Recommend a serving size that keeps each serving reasonably filling and high-protein relative to its calories.`;
  }
  return `The user is in a MAINTENANCE phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day). Recommend a balanced, moderate serving size.`;
}

export async function POST(request: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing GROQ_API_KEY. Add it in your deployment's environment variables." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const { name, ingredients, instructions } = body as {
    name?: string;
    ingredients?: string;
    instructions?: string;
  };

  if (!ingredients || !ingredients.trim()) {
    return NextResponse.json({ error: "Add the ingredients first" }, { status: 400 });
  }

  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  try {
    const result = await groqGenerateJSON({
      toolName: "estimate_recipe_nutrition",
      toolDescription:
        "Report total nutrition for the whole recipe (all ingredients combined) plus a recommended number of servings to split it into.",
      schema: ESTIMATE_SCHEMA,
      maxTokens: 1024,
      prompt: `Estimate the total nutrition for this recipe and recommend how many servings to split it into.

Recipe name: ${name || "(untitled)"}
Ingredients: ${ingredients}
${instructions ? `Instructions: ${instructions}` : ""}

${goalContext(goal as Goal | null)}

Give your best realistic estimate from typical ingredient quantities implied by the list, even with some uncertainty — state any assumptions briefly in serving_note rather than refusing to estimate.`,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    const { status, message } = explainAiError(err);
    return NextResponse.json({ error: message }, { status });
  }
}
