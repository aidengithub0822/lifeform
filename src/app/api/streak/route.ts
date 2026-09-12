import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadAndReconcileStreak } from "@/lib/streakService";

// GET: reconcile the streak up through yesterday, persist it, and return the
// full state plus today's live (not-yet-locked) progress. Safe to call every
// time the app opens — it's a no-op if it already ran today.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const result = await loadAndReconcileStreak(supabase, user.id);
  return NextResponse.json(result);
}
