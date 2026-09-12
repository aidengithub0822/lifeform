import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAndReconcileStreak } from "@/lib/streakService";

// GET /api/widget?token=... — a deliberately unauthenticated (no cookie
// session) read used by home-screen widgets (Scriptable, Shortcuts) that
// can't hold a normal browser login. Gated only by the per-user widget_token,
// which is a 48-char random hex string — long enough that guessing it isn't
// practical, but treat the URL like a password: don't post it publicly.
export async function GET(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY. Add it to enable the widget endpoint." },
      { status: 500 }
    );
  }

  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const admin = createAdminClient();
  const { data: streakRow } = await admin
    .from("streaks")
    .select("user_id")
    .eq("widget_token", token)
    .maybeSingle();

  if (!streakRow) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

  const result = await loadAndReconcileStreak(admin, streakRow.user_id);

  // Return only what a widget needs to render — nothing else about the account.
  return NextResponse.json({
    currentStreak: result.currentStreak,
    longestStreak: result.longestStreak,
    xp: result.xp,
    flameTier: result.flameTier,
    tierColor: result.tierColor,
    tierLabel: result.tierLabel,
    freezesAvailable: result.freezesAvailable,
    today: result.today,
  });
}
