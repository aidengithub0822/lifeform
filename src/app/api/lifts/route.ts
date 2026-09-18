import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ALL_EXERCISES, MUSCLE_GROUPS } from "@/lib/trainingSplits";
import { todayLocal } from "@/lib/timezone";
import { resolveUserTimezone } from "@/lib/requestTimezone";
import type { Lift } from "@/lib/types";

// GET: recent lifts (most recent first), optionally filtered to one muscle
// group — used by the fitness page to show "last logged" per exercise, and
// will feed the per-muscle rank engine next.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const muscle = searchParams.get("muscle");
  const limit = Math.min(200, Number(searchParams.get("limit") ?? 50));

  if (muscle) {
    if (!MUSCLE_GROUPS.includes(muscle as (typeof MUSCLE_GROUPS)[number])) {
      return NextResponse.json({ error: "Invalid muscle" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("lift_muscles")
      .select("muscle_group, lifts(*)")
      .eq("user_id", user.id)
      .eq("muscle_group", muscle)
      .order("lift_id", { ascending: false })
      .limit(limit);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lifts: (data ?? []).map((row) => row.lifts).filter(Boolean) });
  }

  const { data, error } = await supabase
    .from("lifts")
    .select("*")
    .eq("user_id", user.id)
    .order("logged_at", { ascending: false })
    .limit(limit)
    .returns<Lift[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lifts: data ?? [] });
}

// POST: log one set-scheme entry (an exercise done for N sets at a given
// weight/reps). The exercise name must match the fixed catalog so the
// muscles it trains are known exactly — no free-text guessing — and every
// muscle it trains gets its own lift_muscles row.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const liftName = typeof body?.lift_name === "string" ? body.lift_name : null;
  const weightLb = Number(body?.weight_lb);
  const reps = Number(body?.reps);
  const sets = Number(body?.sets ?? 1);

  const catalogEntry = ALL_EXERCISES.find((e) => e.name === liftName);
  if (!catalogEntry) {
    return NextResponse.json({ error: "Unknown exercise — pick one from the list" }, { status: 400 });
  }
  if (!Number.isFinite(weightLb) || weightLb < 0) {
    return NextResponse.json({ error: "Enter a valid weight" }, { status: 400 });
  }
  if (!Number.isInteger(reps) || reps <= 0) {
    return NextResponse.json({ error: "Enter a valid rep count" }, { status: 400 });
  }
  if (!Number.isInteger(sets) || sets <= 0) {
    return NextResponse.json({ error: "Enter a valid set count" }, { status: 400 });
  }

  const { data: lift, error: liftError } = await supabase
    .from("lifts")
    .insert({
      user_id: user.id,
      // The user's LOCAL day, not the server's UTC day — see src/lib/timezone.ts.
      logged_at: todayLocal(await resolveUserTimezone(supabase, user.id)),
      lift_name: catalogEntry.name,
      weight_lb: weightLb,
      reps,
      sets,
    })
    .select("*")
    .single<Lift>();

  if (liftError) return NextResponse.json({ error: liftError.message }, { status: 500 });

  const muscleRows = catalogEntry.muscles.map((muscle_group) => ({
    lift_id: lift.id,
    user_id: user.id,
    muscle_group,
  }));
  const { error: muscleError } = await supabase.from("lift_muscles").insert(muscleRows);
  if (muscleError) {
    // The lift itself saved fine; tell the caller the muscle tagging half
    // failed rather than silently dropping it.
    return NextResponse.json({ lift, warning: `Saved, but muscle tagging failed: ${muscleError.message}` });
  }

  return NextResponse.json({ lift });
}
