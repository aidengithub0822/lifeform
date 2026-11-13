import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser } from "@/lib/notify";
import { RESERVED_DEV_COLOR } from "@/lib/nameColor";
import { ALL_EXERCISES, type MuscleGroup, type ExerciseKind } from "@/lib/trainingSplits";
import { classifyLift, explainAiError } from "@/lib/classifyLift";
import { todayLocal } from "@/lib/timezone";
import { resolveUserTimezone } from "@/lib/requestTimezone";
import type { Lift, CustomLift } from "@/lib/types";

const MAX_NAME_LEN = 60;

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// GET: every custom lift visible to the signed-in user — the whole
// approved catalog (everyone's) plus any of their own still-pending
// submissions (RLS does the actual scoping; see custom_lifts_select in
// schema.sql). The fitness page merges this into the muscle-category
// browser alongside ALL_EXERCISES.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("custom_lifts")
    .select("id, name, kind, muscles, status, difficulty_note")
    .order("name", { ascending: true })
    .returns<Pick<CustomLift, "id" | "name" | "kind" | "muscles" | "status" | "difficulty_note">[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST: log a set for a lift name the user typed instead of picking from
// the fixed catalog. Three paths, cheapest first so this never feels laggy:
//
//   1. The name matches ALL_EXERCISES (case-insensitively) — just use that
//      catalog entry directly, no AI call and nothing written to
//      custom_lifts at all.
//   2. The (normalized) name already exists in custom_lifts and is visible
//      to this user (approved for everyone, or their own still-pending
//      submission) — reuse its existing classification.
//   3. Truly new name — one Groq call classifies it (muscles + exercise
//      kind + a difficulty note), and it's inserted as a new custom_lifts
//      row, status "pending", usable by this user immediately and queued
//      on /dev for a developer to approve or deny before it's everyone's.
//
// Either way, the actual logged set is written to lifts/lift_muscles
// exactly like /api/lifts does — a custom lift is a catalog lookup, not a
// different kind of set.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const rawName = typeof body?.name === "string" ? body.name.trim() : "";
  const weightLb = Number(body?.weight_lb);
  const reps = Number(body?.reps);
  const sets = Number(body?.sets ?? 1);
  const rirRaw = body?.rir;
  const rir = rirRaw == null || rirRaw === "" ? null : Number(rirRaw);
  const isWarmup = body?.is_warmup === true;

  if (!rawName) return NextResponse.json({ error: "Type the name of the lift" }, { status: 400 });
  if (rawName.length > MAX_NAME_LEN) {
    return NextResponse.json({ error: `Keep the name under ${MAX_NAME_LEN} characters` }, { status: 400 });
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
  if (rir != null && (!Number.isFinite(rir) || rir < 0 || rir > 10)) {
    return NextResponse.json({ error: "RIR should be between 0 and 10" }, { status: 400 });
  }

  const normalized = normalize(rawName);

  let resolvedName = rawName;
  let kind: ExerciseKind;
  let muscles: MuscleGroup[];
  let status: "pending" | "approved" | "denied" = "approved";
  let difficultyNote: string | null = null;
  let isNewSubmission = false;

  // 1. Already in the fixed catalog under a different casing/spacing.
  const catalogMatch = ALL_EXERCISES.find((e) => normalize(e.name) === normalized);
  if (catalogMatch) {
    resolvedName = catalogMatch.name;
    kind = catalogMatch.kind;
    muscles = catalogMatch.muscles;
  } else {
    // 2. Already submitted (by anyone, if approved; by this user, if still
    // pending) — RLS scopes this select automatically.
    const { data: existing } = await supabase
      .from("custom_lifts")
      .select("name, kind, muscles, status, difficulty_note")
      .eq("normalized_name", normalized)
      .maybeSingle<Pick<CustomLift, "name" | "kind" | "muscles" | "status" | "difficulty_note">>();

    if (existing) {
      resolvedName = existing.name;
      kind = existing.kind as ExerciseKind;
      muscles = existing.muscles as MuscleGroup[];
      status = existing.status;
      difficultyNote = existing.difficulty_note;
    } else {
      // 3. Brand new — classify it.
      try {
        const classification = await classifyLift(rawName);
        kind = classification.kind;
        muscles = classification.muscles;
        difficultyNote = classification.difficultyNote;
      } catch (err) {
        const { status: errStatus, message } = explainAiError(err);
        return NextResponse.json({ error: message || (err as Error).message }, { status: errStatus });
      }

      status = "pending";
      isNewSubmission = true;

      const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle();

      const { data: inserted, error: insertError } = await supabase
        .from("custom_lifts")
        .insert({
          name: rawName,
          normalized_name: normalized,
          kind,
          muscles,
          difficulty_note: difficultyNote,
          status: "pending",
          created_by: user.id,
          created_by_username: profile?.username ?? null,
        })
        .select("name")
        .single();

      if (insertError) {
        // Unique violation = someone else submitted the exact same name a
        // moment ago (a real race, not a bug) — rather than guess at their
        // classification (which this user may not even be able to see yet
        // under RLS if it's still their pending row), just ask for a retry.
        if (insertError.code === "23505") {
          return NextResponse.json(
            { error: "That lift name was just submitted — try logging it again in a moment." },
            { status: 409 }
          );
        }
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      resolvedName = inserted.name;
    }
  }

  // Write the actual set, same shape as /api/lifts.
  const { data: lift, error: liftError } = await supabase
    .from("lifts")
    .insert({
      user_id: user.id,
      logged_at: todayLocal(await resolveUserTimezone(supabase, user.id)),
      lift_name: resolvedName,
      weight_lb: weightLb,
      reps,
      sets,
      rir,
      is_warmup: isWarmup,
    })
    .select("*")
    .single<Lift>();

  if (liftError) return NextResponse.json({ error: liftError.message }, { status: 500 });

  const muscleRows = muscles.map((muscle_group) => ({ lift_id: lift.id, user_id: user.id, muscle_group }));
  const { error: muscleError } = await supabase.from("lift_muscles").insert(muscleRows);

  // The developer hears about every brand-new submission, so /dev's queue
  // is never the only way to notice one came in.
  if (isNewSubmission) {
    try {
      const admin = createAdminClient();
      const { data: devs } = await admin.from("profiles").select("user_id").eq("name_color", RESERVED_DEV_COLOR).limit(10);
      const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle();
      const name = profile?.username || "Someone";
      await Promise.all(
        (devs ?? [])
          .map((r: { user_id: string }) => r.user_id)
          .filter((id: string) => id !== user.id)
          .map((id: string) =>
            notifyUser(id, {
              actorId: user.id,
              actorUsername: profile?.username ?? null,
              type: "announcement",
              title: `New lift to review 🏋️`,
              body: `${name} typed in "${resolvedName}" — review it on the dev page.`,
              url: "/dev",
            })
          )
      );
    } catch (err) {
      console.error("notify developers of new custom lift failed:", err);
    }
  }

  if (muscleError) {
    return NextResponse.json({ lift, warning: `Saved, but muscle tagging failed: ${muscleError.message}` });
  }

  return NextResponse.json({
    lift,
    customLift: { name: resolvedName, kind, muscles, status, difficultyNote },
  });
}
