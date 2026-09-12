import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

// POST: check in "I trained today" (idempotent — upsert on the unique user+date).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { error } = await supabase
    .from("workouts")
    .upsert({ user_id: user.id, logged_at: todayUTC() }, { onConflict: "user_id,logged_at" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, logged_at: todayUTC() });
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
