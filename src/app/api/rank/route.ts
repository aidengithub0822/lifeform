import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bestValidatedMax,
  computeRank,
  computeRankProgress,
  isBenchName,
  isSquatName,
  validatedWeightLossPct,
  rankMeta,
  xpLevel,
} from "@/lib/rank";

// GET /api/rank — read-only rank summary for the Fitness page's "Overall
// Rank" card: current tier/badge, XP + a cosmetic level, and progress
// toward the next tier (with whichever gate is the bottleneck), so the UI
// doesn't need to duplicate any of the tier math client-side.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [{ data: profile }, { data: goal }, { data: streak }, { data: lifts }, { data: measurements }] =
    await Promise.all([
      supabase.from("profiles").select("created_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("goals").select("sex").eq("user_id", user.id).maybeSingle(),
      supabase.from("streaks").select("xp").eq("user_id", user.id).maybeSingle(),
      supabase.from("lifts").select("logged_at, lift_name, weight_lb, reps").eq("user_id", user.id),
      supabase.from("measurements").select("logged_at, weight_lb").eq("user_id", user.id),
    ]);

  const liftRows = (lifts ?? []) as { logged_at: string; lift_name: string; weight_lb: number; reps: number }[];
  const benchMaxLb = bestValidatedMax(liftRows.filter((r) => isBenchName(r.lift_name)));
  const squatMaxLb = bestValidatedMax(liftRows.filter((r) => isSquatName(r.lift_name)));
  const weightLossPct = validatedWeightLossPct((measurements ?? []) as { logged_at: string; weight_lb: number | null }[]);
  const xp = streak?.xp ?? 0;

  const input = {
    accountCreatedAt: profile?.created_at ?? new Date().toISOString(),
    xp,
    sex: goal?.sex ?? null,
    benchMaxLb,
    squatMaxLb,
    weightLossPct,
  };
  const { tier, nextTier, progress, limitingFactor } = computeRankProgress(input);
  const meta = rankMeta(tier);
  const nextMeta = nextTier ? rankMeta(nextTier) : null;

  return NextResponse.json({
    tier,
    label: meta.label,
    color: meta.color,
    badge: meta.badge,
    xp,
    level: xpLevel(xp),
    progress,
    nextTier,
    nextTierLabel: nextMeta?.label ?? null,
    limitingFactor,
  });
}

// POST /api/rank — recomputes and persists the CALLER's own rank. Reads
// through the caller's normal (RLS-scoped) session so it can only ever see
// its own lifts/measurements/goals/streak — then writes the result with the
// service-role client, which is the only way `profiles.rank` can change
// (see the lock_profile_admin_fields trigger). Fire-and-forget from the
// client after any action that could move the needle (opening the app,
// logging a lift or a weigh-in).
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const [{ data: profile }, { data: goal }, { data: streak }, { data: lifts }, { data: measurements }] =
    await Promise.all([
      supabase.from("profiles").select("created_at").eq("user_id", user.id).maybeSingle(),
      supabase.from("goals").select("sex").eq("user_id", user.id).maybeSingle(),
      supabase.from("streaks").select("xp").eq("user_id", user.id).maybeSingle(),
      supabase.from("lifts").select("logged_at, lift_name, weight_lb, reps").eq("user_id", user.id),
      supabase.from("measurements").select("logged_at, weight_lb").eq("user_id", user.id),
    ]);

  const liftRows = (lifts ?? []) as { logged_at: string; lift_name: string; weight_lb: number; reps: number }[];
  const benchMaxLb = bestValidatedMax(liftRows.filter((r) => isBenchName(r.lift_name)));
  const squatMaxLb = bestValidatedMax(liftRows.filter((r) => isSquatName(r.lift_name)));
  const weightLossPct = validatedWeightLossPct((measurements ?? []) as { logged_at: string; weight_lb: number | null }[]);

  const tier = computeRank({
    accountCreatedAt: profile?.created_at ?? new Date().toISOString(),
    xp: streak?.xp ?? 0,
    sex: goal?.sex ?? null,
    benchMaxLb,
    squatMaxLb,
    weightLossPct,
  });

  const admin = createAdminClient();
  await admin.from("profiles").update({ rank: tier }).eq("user_id", user.id);

  const meta = rankMeta(tier);
  return NextResponse.json({ rank: tier, label: meta.label, color: meta.color });
}
