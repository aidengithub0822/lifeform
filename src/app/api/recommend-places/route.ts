import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { RESTAURANT_BOUNDS, clampPrice } from "@/lib/priceSanity";
import type { Goal } from "@/lib/types";
import { AI_MODEL } from "@/lib/ai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = AI_MODEL;

const PLACES_TOOL = {
  name: "recommend_places",
  description: "Recommend restaurant/place types and what to order there, for a given town, tailored to the user's goal.",
  input_schema: {
    type: "object" as const,
    properties: {
      places: {
        type: "array",
        items: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description:
                "A specific well-known chain/restaurant likely to be in or near this town, OR a restaurant category if none apply (e.g. 'A local Mexican spot')",
            },
            cuisine: { type: "string" },
            price_range: { type: "string", enum: ["$", "$$", "$$$"] },
            est_price_usd: {
              type: "number",
              description:
                "Realistic current US price for the specific suggested order (the whole meal, not per ingredient), as a plain decimal number, e.g. 11.50. Sanity-check it against the price_range symbol and against what a real restaurant receipt for that item would show.",
            },
            order_suggestion: { type: "string", description: "Specific menu item(s) to order that fit the user's goal" },
            why: { type: "string", description: "1 sentence on why this order fits their goal" },
          },
          required: ["name", "cuisine", "price_range", "est_price_usd", "order_suggestion", "why"],
        },
        description: "5-8 place suggestions.",
      },
    },
    required: ["places"],
  },
};

function goalContext(goal: Goal | null): string {
  if (!goal) return "The user hasn't set specific goals yet — suggest generally balanced orders.";
  if (goal.phase === "bulk") {
    return `The user is in a LEAN BULK phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day) — suggest filling, calorie-dense, protein-rich orders, not "diet" options.`;
  }
  if (goal.phase === "cut") {
    return `The user is in a CUTTING phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day) — suggest high-protein, lower-calorie-density orders (grilled over fried, dressings on the side, etc).`;
  }
  return `The user is in a MAINTENANCE phase (target ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day) — suggest balanced orders.`;
}

export async function POST(request: Request) {
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

  const body = await request.json();
  const { town } = body as { town?: string };
  if (!town || !town.trim()) {
    return NextResponse.json({ error: "Enter a city and state first" }, { status: 400 });
  }

  const { data: goal } = await supabase
    .from("goals")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1536,
      tools: [PLACES_TOOL],
      tool_choice: { type: "tool", name: "recommend_places" },
      messages: [
        {
          role: "user",
          content: `The user lives near/in "${town}". You don't have live location data, so reason from your general knowledge of that specific city/region: its cost of living, what chains and local restaurant types are actually common there, and typical menu prices for that area specifically (a meal in a major coastal city usually costs noticeably more than the same meal in a small Midwest town — reflect that, don't use one flat national average). Prefer real, specific restaurants or chains you're confident are common in or near that area; fall back to a general category (e.g. "A local Mexican spot") only when you're not confident a specific name applies there. Recommend restaurants and specific menu items to order. ${goalContext(
            goal as Goal | null
          )}`,
        },
      ],
    });

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json({ error: "Model did not return structured data" }, { status: 502 });
    }

    const input = toolUse.input as { places: { est_price_usd: number }[] };
    input.places = input.places.map((p) => ({ ...p, est_price_usd: clampPrice(p.est_price_usd, RESTAURANT_BOUNDS) }));

    return NextResponse.json(input);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't generate suggestions. Try again." }, { status: 500 });
  }
}
