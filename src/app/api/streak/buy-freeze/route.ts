import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FREEZE_COST_XP, MAX_FREEZES } from "@/lib/streak";

// POST: spend XP to buy one streak freeze (capped at MAX_FREEZES).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: streak } = await supabase
    .from("streaks")
    .select("xp, freezes_available")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!streak) return NextResponse.json({ error: "No streak yet" }, { status: 400 });
  if (streak.freezes_available >= MAX_FREEZES) {
    return NextResponse.json({ error: `You can only hold ${MAX_FREEZES} freezes at once` }, { status: 400 });
  }
  if (streak.xp < FREEZE_COST_XP) {
    return NextResponse.json({ error: `Need ${FREEZE_COST_XP} XP, you have ${streak.xp}` }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("streaks")
    .update({
      xp: streak.xp - FREEZE_COST_XP,
      freezes_available: streak.freezes_available + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
