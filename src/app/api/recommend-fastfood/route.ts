import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { FAST_FOOD_BOUNDS, clampPrice } from "@/lib/priceSanity";
import type { Goal } from "@/lib/types";
import { AI_MODEL } from "@/lib/ai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = AI_MODEL;

// Fast food chains are near-nationwide, so unlike recommend-places this
// needs no location input at all — it's the same list for almost anyone in
// the US, just filtered/ranked by the user's goal.
const FAST_FOOD_TOOL = {
  name: "recommend_fast_food",
  description: "Recommend the best specific menu items to order at popular US fast food chains, for this user's goal.",
  input_schema: {
    type: "object" as const,
    properties: {
      picks: {
        type: "array",
        items: {
          type: "object" as const,
          properties: {
            chain: { type: "string", description: "A real, widely-known US fast food chain, e.g. 'Chick-fil-A' or 'Chipotle'" },
            item: { type: "string", description: "The specific menu item(s)/customization to order, e.g. 'Grilled Chicken Sandwich, no bun'" },
            est_price_usd: {
              type: "number",
              description:
                "Realistic current US menu price for that order as a plain decimal number, e.g. 8.29. A single fast-food order is essentially never under $1 or over $16.",
            },
            calories: { type: "number", description: "Approx calories for that order" },
            protein_g: { type: "number", description: "Approx protein grams for that order" },
            why: { type: "string", description: "1 sentence on why this order fits their goal" },
          },
          required: ["chain", "item", "est_price_usd", "calories", "protein_g", "why"],
        },
        description: "9-12 picks spread across a good variety of well-known chains (burgers, chicken, Mexican, subs, etc), not all from one chain.",
      },
    },
    required: ["picks"],
  },
};

function goalContext(goal: Goal | null): string {
  if (!goal) return "The user hasn't set specific goals yet — pick generally balanced, protein-adequate orders.";
  if (goal.phase === "bulk") {
    return `The user is in a LEAN BULK phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day) — favor filling, calorie-and-protein-dense orders over "diet" options.`;
  }
  if (goal.phase === "cut") {
    return `The user is in a CUTTING phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day) — favor high-protein, lower-calorie-density orders (grilled over fried/breaded, dressings/sauces on the side, skip the bun/fries when it meaningfully helps).`;
  }
  return `The user is in a MAINTENANCE phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day) — favor balanced, protein-adequate orders.`;
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

  const { data: goal } = await supabase.from("goals").select("*").eq("user_id", user.id).maybeSingle();

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      tools: [FAST_FOOD_TOOL],
      tool_choice: { type: "tool", name: "recommend_fast_food" },
      messages: [
        {
          role: "user",
          content: `Recommend the best specific things to order at popular, real, nationwide US fast food chains (McDonald's, Chick-fil-A, Chipotle, Taco Bell, Wendy's, Subway, Panera, Culver's, In-N-Out, Popeyes, etc — pick whichever chains genuinely give the best options for this goal, don't force every chain in). ${goalContext(
            goal as Goal | null
          )} Use realistic, current (2026) US menu prices — sanity-check every number against what a real receipt at that chain would show.`,
        },
      ],
    });

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json({ error: "Model did not return structured data" }, { status: 502 });
    }

    const input = toolUse.input as { picks: { est_price_usd: number }[] };
    input.picks = input.picks.map((p) => ({ ...p, est_price_usd: clampPrice(p.est_price_usd, FAST_FOOD_BOUNDS) }));

    return NextResponse.json(input);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't generate recommendations. Try again." }, { status: 500 });
  }
}
