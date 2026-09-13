import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { awardSpark } from "@/lib/streakService";

// POST: call this right after saving a food log or a workout check-in.
// Awards immediate, escalating XP for today's Nth qualifying log and
// finalizes today's streak growth if this is the first one today — the
// "daily spark" the client shows right away instead of waiting for the
// next day's reconcile.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const result = await awardSpark(supabase, user.id);
  return NextResponse.json(result);
}
