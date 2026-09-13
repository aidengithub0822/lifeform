import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { awardSpark } from "@/lib/streakService";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// POST: check in "I trained today" (idempotent — upsert on the unique user+date).
// Only the FIRST check-in of a given day awards spark XP — repeat taps the
// same day don't re-trigger it, since the row already existed.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const today = todayUTC();
  const { data: existing } = await supabase
    .from("workouts")
    .select("logged_at")
    .eq("user_id", user.id)
    .eq("logged_at", today)
    .maybeSingle();

  const { error } = await supabase
    .from("workouts")
    .upsert({ user_id: user.id, logged_at: today }, { onConflict: "user_id,logged_at" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (existing) {
    return NextResponse.json({ ok: true, logged_at: today, spark: null });
  }

  const spark = await awardSpark(supabase, user.id);
  return NextResponse.json({ ok: true, logged_at: today, spark });
}

// DELETE: undo today's check-in (in case of a misclick).
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { error } = await supabase
    .from("workouts")
    .delete()
    .eq("user_id", user.id)
    .eq("logged_at", todayUTC());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
