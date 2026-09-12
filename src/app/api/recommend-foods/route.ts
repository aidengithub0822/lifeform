import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { Goal } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

const FOODS_TOOL = {
  name: "recommend_foods",
  description:
    "Recommend specific grocery-store foods for this user's goal, ranked cheapest-first within three budget tiers.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "1-2 sentences on the overall strategy for this user's goal phase and budget.",
      },
      picks: {
        type: "array",
        items: {
          type: "object" as const,
          properties: {
            food_name: { type: "string", description: "Specific food, e.g. 'Canned tuna' or 'Chicken thighs'" },
            budget_tier: { type: "string", enum: ["budget", "moderate", "splurge"] },
            est_cost_per_serving: { type: "string", description: "Rough US price per serving, e.g. '$0.75-1.25'" },
            calories: { type: "number", description: "Approx calories per typical serving" },
            protein_g: { type: "number", description: "Approx protein grams per typical serving" },
            why: { type: "string", description: "1 sentence on why this fits their goal and budget" },
          },
          required: ["food_name", "budget_tier", "est_cost_per_serving", "calories", "protein_g", "why"],
        },
        description: "9-12 picks total, spread across all three budget tiers, ranked cheapest-first within each tier.",
      },
    },
    required: ["summary", "picks"],
  },
};

function goalContext(goal: Goal | null): string {
  if (!goal) {
    return "The user hasn't set specific goals yet. Recommend generally balanced, affordable whole foods.";
  }
  if (goal.phase === "bulk") {
    return `The user is in a LEAN BULK phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day). Favor calorie-dense, protein-rich, affordable staples (e.g. rice, oats, eggs, ground beef, peanut butter) over low-calorie "diet" foods.`;
  }
  if (goal.phase === "cut") {
    return `The user is in a CUTTING phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day). Favor high-protein, high-volume, lower-calorie-density foods (e.g. chicken breast, egg whites, greek yogurt, vegetables) that keep them full on fewer calories.`;
  }
  return `The user is in a MAINTENANCE phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day). Favor balanced, protein-adequate, affordable whole foods.`;
}

export async function GET() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in your deployment's environment variables." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      tools: [FOODS_TOOL],
      tool_choice: { type: "tool", name: "recommend_foods" },
      messages: [
        {
          role: "user",
          content: `Recommend specific, widely-available grocery foods (US grocery stores) for this user, ranked by budget. ${goalContext(
            goal as Goal | null
          )} Use realistic, typical US grocery prices. Give 9-12 picks total: a few "budget" (cheapest staples), a few "moderate", and a few "splurge" (still reasonable, just pricier/higher quality) options, ranked cheapest-first within each tier.`,
        },
      ],
    });

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json({ error: "Model did not return structured data" }, { status: 502 });
    }

    return NextResponse.json(toolUse.input);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't generate recommendations. Try again." }, { status: 500 });
  }
}
