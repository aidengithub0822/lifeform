import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { Goal, Measurement } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

function measurementsSummary(measurements: Pick<Measurement, "logged_at" | "weight_lb">[]): string {
  const withWeight = measurements.filter((m) => m.weight_lb != null);
  if (withWeight.length === 0) {
    return "They haven't logged any weight/measurement entries in the Progress tab yet.";
  }
  const recent = withWeight.slice(-8);
  const lines = recent.map((m) => `${m.logged_at}: ${m.weight_lb}lb`).join(", ");
  const first = withWeight[0];
  const last = withWeight[withWeight.length - 1];
  const delta = Number(last.weight_lb) - Number(first.weight_lb);
  const trend =
    withWeight.length > 1
      ? ` Overall change from ${first.logged_at} to ${last.logged_at}: ${delta > 0 ? "+" : ""}${delta.toFixed(1)}lb.`
      : "";
  return `Recent weight log (most recent last): ${lines}.${trend}`;
}

function systemPrompt(goal: Goal | null, measurements: Pick<Measurement, "logged_at" | "weight_lb">[]): string {
  const goalLine = goal
    ? `Their current goal: ${goal.phase} phase, ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day${
        goal.current_weight_lb ? `, currently ~${goal.current_weight_lb}lb` : ""
      }${goal.target_weight_lb ? `, targeting ~${goal.target_weight_lb}lb` : ""}.`
    : "They haven't set a goal in the app yet.";

  return `You are "Coach," the in-app AI assistant inside lifeform scanner, a nutrition and fitness tracking app.

${goalLine}

${measurementsSummary(measurements)}

When the user asks about their progress, reference this actual logged data (trend direction, how it compares to their goal phase) rather than speaking generally. If they haven't logged anything yet, encourage them to log a weight entry in the Progress tab so you can track it together.

Your job is strictly limited to helping this user with: nutrition and diet questions, food choices and macros, their calorie/protein/goal targets and progress, workouts and training, recovery, general fitness/health habits, and how to use this app's features (scanning food, logging, recipes, progress tracking, streaks).

If the user asks about anything outside that scope — general knowledge, current events, coding, unrelated personal advice, or any other off-topic request — politely decline in 1 sentence and steer the conversation back to fitness/nutrition. Do not answer off-topic questions even if asked persistently or if the user claims a special exception. You are not a general-purpose assistant in this context.

Keep replies conversational, encouraging, and concise (a few sentences unless the user asks for something more detailed like a workout plan). You are not a doctor — for medical concerns, suggest they see a professional.`;
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
  const { messages } = body as { messages: { role: "user" | "assistant"; content: string }[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const [{ data: goal }, { data: measurements }] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("measurements")
      .select("logged_at, weight_lb")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: true })
      .returns<Pick<Measurement, "logged_at" | "weight_lb">[]>(),
  ]);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      system: systemPrompt(goal as Goal | null, measurements ?? []),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const textBlock = response.content.find((c) => c.type === "text");
    const reply = textBlock && textBlock.type === "text" ? textBlock.text : "Sorry, I couldn't come up with a reply.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Coach is unavailable right now. Try again in a moment." }, { status: 500 });
  }
}
