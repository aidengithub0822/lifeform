import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MUSCLE_GROUPS } from "@/lib/trainingSplits";
import { computeAllMuscleRanks, type LiftForRank } from "@/lib/muscleRank";
import type { TrainingPlan, Measurement } from "@/lib/types";

// GET: per-muscle rank for every tracked muscle group, computed from the
// signed-in user's logged lifts relative to their bodyweight. Bodyweight
// comes from the Train quiz's ideal_weight_lb first (that's what the user
// told us to judge their strength against), falling back to their most
// recent Progress weigh-in if the quiz hasn't been run.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [{ data: lifts }, { data: plan }, { data: measurements }] = await Promise.all([
    supabase
      .from("lifts")
      .select("lift_name, weight_lb, reps, sets")
      .eq("user_id", user.id)
      .limit(500)
      .returns<LiftForRank[]>(),
    supabase.from("training_plans").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("measurements")
      .select("logged_at, weight_lb")
      .eq("user_id", user.id)
      .not("weight_lb", "is", null)
      .order("logged_at", { ascending: false })
      .limit(1)
      .returns<Pick<Measurement, "logged_at" | "weight_lb">[]>(),
  ]);

  const trainingPlan = plan as TrainingPlan | null;
  const bodyweightLb = trainingPlan?.ideal_weight_lb ?? measurements?.[0]?.weight_lb ?? null;

  const ranks = computeAllMuscleRanks(MUSCLE_GROUPS, lifts ?? [], bodyweightLb);

  return NextResponse.json({ ranks, bodyweightLb, bodyweightSource: trainingPlan?.ideal_weight_lb ? "quiz" : measurements?.[0] ? "progress" : "default" });
}
