import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MUSCLE_GROUPS, type MuscleGroup, type ExerciseKind } from "@/lib/trainingSplits";
import { computeAllMuscleRanks, type LiftForRank, type CatalogEntryForRank } from "@/lib/muscleRank";
import { weeklyMuscleVolume } from "@/lib/hypertrophyEngine";
import type { TrainingPlan, Measurement, CustomLift } from "@/lib/types";

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

  const [{ data: lifts }, { data: plan }, { data: measurements }, { data: customLifts }] = await Promise.all([
    supabase
      .from("lifts")
      .select("lift_name, weight_lb, reps, sets, logged_at, is_warmup")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: true })
      .limit(3000)
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
    // RLS already scopes this to approved lifts (everyone's catalog) plus
    // this user's own pending submissions — never someone else's pending or
    // denied ones. See the custom_lifts_select policy in schema.sql.
    supabase
      .from("custom_lifts")
      .select("name, kind, muscles")
      .returns<Pick<CustomLift, "name" | "kind" | "muscles">[]>(),
  ]);

  const trainingPlan = plan as TrainingPlan | null;
  const bodyweightLb = trainingPlan?.ideal_weight_lb ?? measurements?.[0]?.weight_lb ?? null;

  const extraCatalog: CatalogEntryForRank[] = (customLifts ?? []).map((c) => ({
    name: c.name,
    kind: c.kind as ExerciseKind,
    muscles: c.muscles as MuscleGroup[],
  }));
  const ranks = computeAllMuscleRanks(MUSCLE_GROUPS, lifts ?? [], bodyweightLb, extraCatalog);

  // The split's weekly per-muscle volume (direct + fractional secondary
  // credit) — lets the Fitness page show "this split trains it for ~X
  // sets/week" instead of only a rank badge. Null when no plan exists yet.
  const weeklyVolume = trainingPlan ? weeklyMuscleVolume(trainingPlan.split_type) : null;

  return NextResponse.json({
    ranks,
    bodyweightLb,
    bodyweightSource: trainingPlan?.ideal_weight_lb ? "quiz" : measurements?.[0] ? "progress" : "default",
    weeklyVolume,
  });
}
