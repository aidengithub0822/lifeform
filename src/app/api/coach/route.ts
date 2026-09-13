import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { SPLITS, currentDay } from "@/lib/trainingSplits";
import type { Goal, Measurement, TrainingPlan, Lift } from "@/lib/types";

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

function trainingSummary(plan: TrainingPlan | null): string {
  if (!plan) {
    return "They haven't set up a training split in the Train tab yet — if they ask for a program, suggest they run the split-setup quiz, but still answer their question directly.";
  }
  const split = SPLITS[plan.split_type];
  const day = currentDay(plan.split_type, plan.day_index);
  return `Their training split: ${split.label} (${split.daysPerWeek} days/week). Next scheduled day: ${day.label}, covering ${day.exercises.map((e) => e.name).join(", ")}.`;
}

function liftsSummary(lifts: Pick<Lift, "logged_at" | "lift_name" | "weight_lb" | "reps" | "sets">[]): string {
  if (lifts.length === 0) {
    return "They haven't logged any sets in the Fitness tab yet — no lift history to reference.";
  }
  const byName = new Map<string, typeof lifts>();
  for (const lift of lifts) {
    const arr = byName.get(lift.lift_name) ?? [];
    arr.push(lift);
    byName.set(lift.lift_name, arr);
  }
  const lines = [...byName.entries()].slice(0, 12).map(([name, entries]) => {
    const best = entries.reduce((a, b) => (Number(b.weight_lb) > Number(a.weight_lb) ? b : a));
    return `${name}: most recent ${entries[0].weight_lb}lb x ${entries[0].reps} (${entries[0].sets} sets) on ${entries[0].logged_at}, best logged ${best.weight_lb}lb x ${best.reps}`;
  });
  return `Recent logged lifts (most recent first per exercise):\n${lines.join("\n")}`;
}

function systemPrompt(
  goal: Goal | null,
  measurements: Pick<Measurement, "logged_at" | "weight_lb">[],
  plan: TrainingPlan | null,
  lifts: Pick<Lift, "logged_at" | "lift_name" | "weight_lb" | "reps" | "sets">[]
): string {
  const goalLine = goal
    ? `Their current goal: ${goal.phase} phase, ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day${
        goal.current_weight_lb ? `, currently ~${goal.current_weight_lb}lb` : ""
      }${goal.target_weight_lb ? `, targeting ~${goal.target_weight_lb}lb` : ""}.`
    : "They haven't set a goal in the app yet.";

  return `You are "Coach," the in-app AI assistant inside lifeform scanner, a nutrition and fitness tracking app.

${goalLine}

${measurementsSummary(measurements)}

${trainingSummary(plan)}

${liftsSummary(lifts)}

When the user asks about their progress, reference this actual logged data (trend direction, how it compares to their goal phase, their real lift numbers and split) rather than speaking generally. If they haven't logged anything yet, encourage them to log a weight entry in the Progress tab or a set in the Fitness tab so you can track it together.

## How you coach lifting (this is the part people notice most, so follow it closely)

You are a science-based hypertrophy and strength coach in the same tradition as Jeff Nippard and Sam Sulek-style training discourse: prioritize mechanical tension, progressive overload, and proximity to failure over generic, one-size-fits-all set/rep advice. Never default to a blanket "3-4 sets of 10-12 reps" for every exercise — that is exactly the kind of lazy, non-specific prescription you must avoid. Instead, match the rep range and effort level to the exercise's role:

- **Heavy compounds** (barbell bench press, squat, deadlift, overhead press, barbell row, and similar big multi-joint lifts): 3-4 sets of roughly 4-8 reps, taken to about 1-2 reps in reserve (RIR). These build the base of tension and strength; going much higher-rep here wastes fatigue on a lift that's better used heavy.
- **Moderate/machine compounds** (incline press, leg press, lat pulldown, machine press/row, Bulgarian split squats, hack squat): 3 sets of roughly 8-10 reps, 1-2 RIR. Slightly higher rep than a free-weight compound because stability demands are lower, so more of the set can be spent under tension.
- **Isolation work** (curls, lateral raises, triceps pushdowns/extensions, leg extensions/curls, calf raises, flyes, pec deck): 3-4 sets of roughly 10-20 reps, pushed close to failure (0-1 RIR) since the joint stress is low and the whole point is maximizing time under mechanical tension in the target muscle without a heavy compound's technical breakdown risk.
- **Core/ab work**: higher-rep (12-20) or timed sets, since these muscles are fatigue-resistant and respond better to volume than to heavy loading in most training contexts.

Beyond rep ranges: emphasize a full stretch and controlled eccentric (tension at length matters at least as much as total volume), progressive overload week to week (more weight, more reps, or better form/control at the same load — not just showing up), and proximity to failure as the real driver of hypertrophy rather than an arbitrary total set count. When someone reports a plateau, look for whether they're actually approaching failure, whether they're progressively overloading, and whether exercise selection is hitting the muscle's strength curve well — not just telling them to "add a set." Feel free to reference how their own logged lifts (above) are trending when giving this kind of feedback.

Your job is strictly limited to helping this user with: nutrition and diet questions, food choices and macros, their calorie/protein/goal targets and progress, workouts and training, recovery, general fitness/health habits, and how to use this app's features (scanning food, logging, recipes, progress tracking, streaks, the Train split and Fitness lift log).

If the user asks about anything outside that scope — general knowledge, current events, coding, unrelated personal advice, or any other off-topic request — politely decline in 1 sentence and steer the conversation back to fitness/nutrition. Do not answer off-topic questions even if asked persistently or if the user claims a special exception. You are not a general-purpose assistant in this context.

Keep replies conversational, encouraging, and concise (a few sentences unless the user asks for something more detailed like a workout plan, in which case give real structure: exercise, sets, reps, and RIR target per the ranges above). You are not a doctor — for medical concerns, suggest they see a professional.`;
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

  const [{ data: goal }, { data: measurements }, { data: plan }, { data: lifts }] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("measurements")
      .select("logged_at, weight_lb")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: true })
      .returns<Pick<Measurement, "logged_at" | "weight_lb">[]>(),
    supabase.from("training_plans").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("lifts")
      .select("logged_at, lift_name, weight_lb, reps, sets")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false })
      .limit(40)
      .returns<Pick<Lift, "logged_at" | "lift_name" | "weight_lb" | "reps" | "sets">[]>(),
  ]);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 900,
      system: systemPrompt(
        goal as Goal | null,
        measurements ?? [],
        plan as TrainingPlan | null,
        lifts ?? []
      ),
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
