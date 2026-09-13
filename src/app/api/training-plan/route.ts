import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SPLITS, type SplitDefinition } from "@/lib/trainingSplits";
import type { TrainingGoal, TrainingPlan } from "@/lib/types";

const GOALS: TrainingGoal[] = ["build_muscle", "get_stronger", "lose_fat", "general_fitness"];
const SPLIT_KEYS = Object.keys(SPLITS) as SplitDefinition["key"][];

// GET: the signed-in user's training plan, or { plan: null } if they haven't
// done the Train setup quiz yet — the client uses that to force the quiz.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("training_plans")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<TrainingPlan>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data ?? null });
}

// POST: save the quiz result. Always resets day_index to 0 — picking a new
// split (or redoing the quiz) restarts at that split's first day.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const training_goal = body?.training_goal;
  const split_type = body?.split_type;
  const ideal_weight_lb = body?.ideal_weight_lb ?? null;
  const sex = body?.sex ?? null;

  if (!GOALS.includes(training_goal)) {
    return NextResponse.json({ error: "Invalid training_goal" }, { status: 400 });
  }
  if (!SPLIT_KEYS.includes(split_type)) {
    return NextResponse.json({ error: "Invalid split_type" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("training_plans")
    .upsert(
      {
        user_id: user.id,
        training_goal,
        split_type,
        ideal_weight_lb,
        sex,
        day_index: 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single<TrainingPlan>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}

// PATCH: advance to the next day in the split's rotation (called after
// checking off today's workout on /fitness).
export async function PATCH() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: existing, error: fetchError } = await supabase
    .from("training_plans")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<TrainingPlan>();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "No training plan yet" }, { status: 404 });

  const dayCount = SPLITS[existing.split_type].days.length;
  const nextIndex = (existing.day_index + 1) % dayCount;

  const { data, error } = await supabase
    .from("training_plans")
    .update({ day_index: nextIndex, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .select("*")
    .single<TrainingPlan>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ plan: data });
}
