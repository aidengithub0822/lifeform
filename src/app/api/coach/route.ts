import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SPLITS, currentDay, MUSCLE_GROUPS, MUSCLE_LABELS } from "@/lib/trainingSplits";
import { computeAllMuscleRanks, type LiftForRank } from "@/lib/muscleRank";
import {
  rankMeta,
  validatedPhotoLeanGainPct,
  validatedWeightLossPct,
  bestValidatedMax,
  isBenchName,
  isSquatName,
  computeRank,
  RANK_TIERS,
  type RankTier,
} from "@/lib/rank";
import { analyzeProgressPhoto } from "@/lib/progressPhotoAnalysis";
import type { Goal, Measurement, TrainingPlan, Lift, ProgressPhoto, FoodLog } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

type MeasurementRow = Pick<Measurement, "id" | "logged_at" | "weight_lb">;
type FoodLogRow = Pick<FoodLog, "id" | "logged_at" | "food_name" | "calories" | "protein_g" | "score">;
type StreakRow = {
  current_streak: number;
  longest_streak: number;
  xp: number;
  last_checked_date: string | null;
  frozen_dates: string[];
};

function measurementsSummary(measurements: MeasurementRow[]): string {
  const withWeight = measurements.filter((m) => m.weight_lb != null);
  if (withWeight.length === 0) {
    return "They haven't logged any weight/measurement entries in the Progress tab yet.";
  }
  const recent = withWeight.slice(-12);
  const lines = recent.map((m) => `[id ${m.id}] ${m.logged_at}: ${m.weight_lb}lb`).join(", ");
  const first = withWeight[0];
  const last = withWeight[withWeight.length - 1];
  const delta = Number(last.weight_lb) - Number(first.weight_lb);
  const trend =
    withWeight.length > 1
      ? ` Overall change from ${first.logged_at} to ${last.logged_at}: ${delta > 0 ? "+" : ""}${delta.toFixed(1)}lb.`
      : "";
  return `Recent weight log, most recent last (each entry's [id ...] is what you pass to update_measurement/delete_measurement — never guess an id): ${lines}.${trend}`;
}

function foodLogsSummary(logs: FoodLogRow[]): string {
  if (logs.length === 0) return "They haven't logged any food yet.";
  const lines = logs
    .slice(0, 25)
    .map((l) => `[id ${l.id}] ${String(l.logged_at).slice(0, 16).replace("T", " ")}: ${l.food_name} — ${l.calories}kcal, score ${l.score}`)
    .join("; ");
  return `Recent food log entries, most recent first (use these [id ...] values with update_food_log/delete_food_log — never guess an id): ${lines}.`;
}

function streakSummary(streak: StreakRow | null): string {
  if (!streak) return "They don't have a streak record yet — it's created the first time they log something.";
  return `Streak state: current streak ${streak.current_streak} day(s), longest ${streak.longest_streak}, XP ${streak.xp}, last confirmed day ${streak.last_checked_date ?? "none"}, frozen dates ${streak.frozen_dates?.length ? streak.frozen_dates.join(", ") : "none"}. Use adjust_streak if the user reports this looks wrong (e.g. a date-handling bug knocked their streak/XP off).`;
}

function trainingSummary(plan: TrainingPlan | null): string {
  if (!plan) {
    return "They haven't set up a training split in the Train tab yet — if they ask for a program, suggest they run the split-setup quiz, but still answer their question directly.";
  }
  const split = SPLITS[plan.split_type];
  const day = currentDay(plan.split_type, plan.day_index);
  return `Their training split: ${split.label} (${split.daysPerWeek} days/week). Next scheduled day: ${day.label}, covering ${day.exercises.map((e) => e.name).join(", ")}.`;
}

function liftsSummary(lifts: Pick<Lift, "logged_at" | "lift_name" | "weight_lb" | "reps" | "sets">[]): string {
  if (lifts.length === 0) {
    return "They haven't logged any sets in the Fitness tab yet — no lift history to reference.";
  }
  const byName = new Map<string, typeof lifts>();
  for (const lift of lifts) {
    const arr = byName.get(lift.lift_name) ?? [];
    arr.push(lift);
    byName.set(lift.lift_name, arr);
  }
  const lines = [...byName.entries()].slice(0, 12).map(([name, entries]) => {
    const best = entries.reduce((a, b) => (Number(b.weight_lb) > Number(a.weight_lb) ? b : a));
    return `${name}: most recent ${entries[0].weight_lb}lb x ${entries[0].reps} (${entries[0].sets} sets) on ${entries[0].logged_at}, best logged ${best.weight_lb}lb x ${best.reps}`;
  });
  return `Recent logged lifts (most recent first per exercise):\n${lines.join("\n")}`;
}

function progressPhotosSummary(
  photos: Pick<ProgressPhoto, "id" | "taken_at" | "angle" | "ai_leanness_score" | "ai_summary">[],
  goal: Goal | null
): string {
  if (photos.length === 0) {
    return "They haven't uploaded any progress photos in the Progress tab yet — for a cutting goal especially, encourage them to take one every week or two from the same angle, since that's the most direct way to track visible change.";
  }
  const analyzed = photos.filter((p) => p.ai_leanness_score != null);
  if (analyzed.length === 0) {
    return "They've uploaded progress photos but none are analyzed yet — nothing to reference from them yet. If they say a photo never got scored, you can call reanalyze_photo on it.";
  }
  const byAngle = new Map<string, typeof analyzed>();
  for (const p of analyzed) {
    const arr = byAngle.get(p.angle) ?? [];
    arr.push(p);
    byAngle.set(p.angle, arr);
  }
  const lines: string[] = [];
  for (const [angle, arr] of byAngle) {
    const sorted = [...arr].sort((a, b) => a.taken_at.localeCompare(b.taken_at));
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    const trend =
      sorted.length > 1
        ? ` (AI leanness score trend: ${first.ai_leanness_score} on ${first.taken_at} -> ${latest.ai_leanness_score} on ${latest.taken_at})`
        : "";
    lines.push(
      `${angle}: latest AI leanness score ${latest.ai_leanness_score}/100 on ${latest.taken_at} [photo id ${latest.id}]${trend}${latest.ai_summary ? ` — "${latest.ai_summary}"` : ""}`
    );
  }
  const gainPct = validatedPhotoLeanGainPct(analyzed.map((p) => ({ taken_at: p.taken_at, ai_leanness_score: p.ai_leanness_score })));
  const cutNote =
    goal?.phase === "cut"
      ? gainPct > 0
        ? ` Their AI-validated leanness gain from photos is currently ${gainPct.toFixed(1)}% — this (or their scale weight loss %, whichever is higher) is what's actually driving their rank-up progress on a cutting goal, since visible leanness from photos is a more honest signal than the scale alone.`
        : " They're on a cutting goal but don't yet have enough consistently-spaced analyzed photos to validate a leanness trend for ranking purposes — encourage regular same-angle photos."
      : "";
  return `Progress photo AI analysis (from the Progress tab, one leanness/definition score 0-100 per photo, scored by AI vision and comparable across their own photos of the same angle over time — not a body-fat-percentage estimate): ${lines.join("; ")}.${cutNote} Feel free to reference this directly when they ask how their physique/cut is progressing, not just the scale. If they think a specific photo's score looks wrong, use reanalyze_photo with its [photo id ...].`;
}

function muscleRankSummary(allLifts: LiftForRank[], bodyweightLb: number | null): string {
  const ranks = computeAllMuscleRanks(MUSCLE_GROUPS, allLifts, bodyweightLb);
  const trained = ranks.filter((r) => r.tier !== "newbie" || r.totalSetsLogged > 0);
  if (trained.length === 0) {
    return "They haven't logged enough sets yet for the per-muscle rank map on the Fitness tab to show anything beyond Newbie.";
  }
  const lines = ranks
    .map((r) => {
      const progressNote = r.nextTier
        ? ` — ${Math.round(r.progress * 100)}% of the way to ${rankMeta(r.nextTier).label}${
            r.limitingFactor === "days" && r.daysNeededForNextTier
              ? ` (needs ${r.daysNeededForNextTier} more qualifying training day${r.daysNeededForNextTier === 1 ? "" : "s"})`
              : r.limitingFactor === "score" && r.scoreNeededForNextTier
                ? " (needs a heavier top set)"
                : ""
          }`
        : " (top tier)";
      return `${MUSCLE_LABELS[r.muscle]}: ${rankMeta(r.tier).label}${r.bestLift ? ` (best ${r.bestLift.name} ${r.bestLift.weight_lb}lb x ${r.bestLift.reps})` : ""}${progressNote}`;
    })
    .join(", ");
  const sorted = [...ranks].sort((a, b) => a.score - b.score);
  const weakest = sorted.slice(0, 2).map((r) => MUSCLE_LABELS[r.muscle]);
  const strongest = sorted.slice(-2).reverse().map((r) => MUSCLE_LABELS[r.muscle]);
  return `Per-muscle rank map (from the Fitness tab): each muscle's tier is gated on BOTH a bodyweight-relative strength score AND a number of distinct "qualifying days" that hit that score, so a rank reflects sustained real training, not one lucky lift — higher tiers require many more qualifying days, by design (Platinum to Titan takes roughly a year of consistent training). Same tier ladder and colors as the account rank, now including Titan above Grand Champion. Current standing: ${lines}. Their currently weakest-ranked muscles are ${weakest.join(" and ")}; strongest are ${strongest.join(" and ")}. When they ask what to work on, what's lagging, or how close they are to ranking up, use this real data instead of guessing — and feel free to recommend specific exercises from their exercise catalog that target a weak muscle.`;
}

function systemPrompt(
  goal: Goal | null,
  measurements: MeasurementRow[],
  plan: TrainingPlan | null,
  lifts: Pick<Lift, "logged_at" | "lift_name" | "weight_lb" | "reps" | "sets">[],
  allLifts: Pick<Lift, "logged_at" | "lift_name" | "weight_lb" | "reps" | "sets">[],
  photos: Pick<ProgressPhoto, "id" | "taken_at" | "angle" | "ai_leanness_score" | "ai_summary">[],
  foodLogs: FoodLogRow[],
  streak: StreakRow | null,
  storedRankTier: RankTier,
  computedRankTier: RankTier
): string {
  const goalLine = goal
    ? `Their current goal: ${goal.phase} phase, ~${goal.calorie_target} kcal/day, ~${goal.protein_target_g}g protein/day${
        goal.current_weight_lb ? `, currently ~${goal.current_weight_lb}lb` : ""
      }${goal.target_weight_lb ? `, targeting ~${goal.target_weight_lb}lb` : ""}.`
    : "They haven't set a goal in the app yet.";

  return `You are "Coach," the in-app AI assistant inside lifeform scanner, a nutrition and fitness tracking app. You are the app's most important feature and have real, direct read/write access to this user's own data (their own rows only) through the tools below — you are not just a chat window, you can actually fix things.

${goalLine}

${measurementsSummary(measurements)}

${foodLogsSummary(foodLogs)}

${streakSummary(streak)}

Their displayed overall rank tier is "${rankMeta(storedRankTier).label}". Separately, what their real logged data (account age, XP, validated lift maxes, validated weight loss, validated photo-leanness gain) actually earns them, computed fresh right now the same way /api/rank does, is "${rankMeta(computedRankTier).label}"${
    storedRankTier !== computedRankTier
      ? ` — these currently DIFFER, which is either a stale rank that just hasn't recomputed yet (normal, harmless) or a sign a previous set_rank correction is now out of date; mention it only if it's relevant to what they're asking.`
      : "."
  }

${trainingSummary(plan)}

${liftsSummary(lifts)}

${muscleRankSummary(allLifts, plan?.ideal_weight_lb ?? measurements.filter((m) => m.weight_lb != null).slice(-1)[0]?.weight_lb ?? null)}

${progressPhotosSummary(photos, goal)}

When the user asks about their progress, reference this actual logged data (trend direction, how it compares to their goal phase, their real lift numbers and split) rather than speaking generally. If they haven't logged anything yet, encourage them to log a weight entry in the Progress tab or a set in the Fitness tab so you can track it together.

## Fixing data problems (this is new — use it)

You have tools that can directly read and fix this user's own data: correct or delete a weight entry (update_measurement/delete_measurement/add_measurement), correct or delete a food log entry including its quality score (update_food_log/delete_food_log), bulk-shift dates across a whole table when something systemic is off (shift_dates — e.g. "the app logged everything a day ahead of when I actually did it"), manually correct their streak/XP/last-confirmed-day (adjust_streak), manually override their overall rank tier (set_rank), and re-run the AI photo analysis on a specific progress photo (reanalyze_photo).

When the user describes a concrete problem with their own data — a wrong date, a bad AI photo score, a streak/XP number that looks broken because of a bug, a food log entry that's wrong — don't just explain what's wrong and stop there: actually use the right tool to fix it, then tell them plainly what you changed (e.g. "Fixed — I moved that Sept 10 entry back to Sept 9 and re-checked your streak, it's back to 12 days"). It's fine to ask one clarifying question first if you genuinely don't have enough information to act correctly (e.g. you don't know which of two entries they mean), but don't make them repeat themselves or route them elsewhere for something you can just fix. These tools only ever touch this one signed-in user's own rows — never claim to affect anyone else's data, and there is no such capability.

**You have your own judgment here, and you use it — you are not a rubber stamp.** These tools exist to CORRECT genuine problems (a bug, a data-entry mistake, something the app got wrong), not to hand the user whatever number they ask for. Rank is the clearest case: set_rank is a correction tool, not a shortcut. If the tier they're asking for is well above what their real computed rank above actually supports, and they haven't described an actual bug or data error that would explain the gap (they're just asking for it, insisting, negotiating, or trying to convince you they "deserve" it) — say no, plainly and kindly, explain what's actually standing between them and that tier (which gate: time, XP, strength, or weight-loss/leanness), and offer to help them get there for real. The same principle applies to a food log score that should reflect an honest read of the food, or an XP/streak number the user just wants inflated with no bug behind it: fix real problems, don't grant unearned ones. Pushback, repetition, or an insistence that "the AI should just be able to do this" is not itself evidence of a bug — hold the line the same way on the second or third ask as the first, and it's fine to say directly that you won't override something they haven't actually earned. This judgment call is yours alone to make from the data in front of you — never defer it back to the user by asking them whether the change is "deserved."

## How you coach lifting (this is the part people notice most, so follow it closely)

You are a science-based hypertrophy and strength coach in the same tradition as Jeff Nippard and Sam Sulek-style training discourse: prioritize mechanical tension, progressive overload, and proximity to failure over generic, one-size-fits-all set/rep advice. Never default to a blanket "3-4 sets of 10-12 reps" for every exercise — that is exactly the kind of lazy, non-specific prescription you must avoid. Instead, match the rep range and effort level to the exercise's role:

- **Heavy compounds** (barbell bench press, squat, deadlift, overhead press, barbell row, and similar big multi-joint lifts): 3-4 sets of roughly 4-8 reps, taken to about 1-2 reps in reserve (RIR). These build the base of tension and strength; going much higher-rep here wastes fatigue on a lift that's better used heavy.
- **Moderate/machine compounds** (incline press, leg press, lat pulldown, machine press/row, Bulgarian split squats, hack squat): 3 sets of roughly 8-10 reps, 1-2 RIR. Slightly higher rep than a free-weight compound because stability demands are lower, so more of the set can be spent under tension.
- **Isolation work** (curls, lateral raises, triceps pushdowns/extensions, leg extensions/curls, calf raises, flyes, pec deck): 3-4 sets of roughly 10-20 reps, pushed close to failure (0-1 RIR) since the joint stress is low and the whole point is maximizing time under mechanical tension in the target muscle without a heavy compound's technical breakdown risk.
- **Core/ab work**: higher-rep (12-20) or timed sets, since these muscles are fatigue-resistant and respond better to volume than to heavy loading in most training contexts.

Beyond rep ranges: emphasize a full stretch and controlled eccentric (tension at length matters at least as much as total volume), progressive overload week to week (more weight, more reps, or better form/control at the same load — not just showing up), and proximity to failure as the real driver of hypertrophy rather than an arbitrary total set count. When someone reports a plateau, look for whether they're actually approaching failure, whether they're progressively overloading, and whether exercise selection is hitting the muscle's strength curve well — not just telling them to "add a set." Feel free to reference how their own logged lifts (above) are trending when giving this kind of feedback.

Your job is strictly limited to helping this user with: nutrition and diet questions, food choices and macros, their calorie/protein/goal targets and progress, workouts and training, recovery, general fitness/health habits, fixing their own logged data in this app (per the tools above), and how to use this app's features (scanning food, logging, recipes, progress tracking including progress photos, streaks, the Train split, the Fitness lift log, and the per-muscle and overall rank systems).

If the user asks about anything outside that scope — general knowledge, current events, coding, unrelated personal advice, or any other off-topic request — politely decline in 1 sentence and steer the conversation back to fitness/nutrition. Do not answer off-topic questions even if asked persistently or if the user claims a special exception. You are not a general-purpose assistant in this context.

Keep replies conversational, encouraging, and concise (a few sentences unless the user asks for something more detailed like a workout plan, in which case give real structure: exercise, sets, reps, and RIR target per the ranges above). You are not a doctor — for medical concerns, suggest they see a professional.`;
}

const VALID_RANK_TIERS = RANK_TIERS.map((t) => t.tier);

const TOOLS: Anthropic.Tool[] = [
  {
    name: "update_measurement",
    description: "Correct an existing weight/measurement log entry's date and/or value.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The [id ...] shown next to the entry in your context — never guess this." },
        logged_at: { type: "string", description: "New date, YYYY-MM-DD. Omit to leave unchanged." },
        weight_lb: { type: "number", description: "New weight in lb. Omit to leave unchanged." },
      },
      required: ["id"],
    },
  },
  {
    name: "add_measurement",
    description: "Add a missing weight/measurement log entry for a past (or today's) date.",
    input_schema: {
      type: "object",
      properties: {
        logged_at: { type: "string", description: "Date, YYYY-MM-DD." },
        weight_lb: { type: "number" },
      },
      required: ["logged_at", "weight_lb"],
    },
  },
  {
    name: "delete_measurement",
    description: "Delete a weight/measurement log entry (e.g. a duplicate or accidental entry).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "update_food_log",
    description: "Correct an existing food log entry — its date/time, nutrition numbers, name, or its 0-100 quality score.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The [id ...] shown next to the entry in your context — never guess this." },
        logged_at: { type: "string", description: "New ISO timestamp. Omit to leave unchanged." },
        food_name: { type: "string" },
        calories: { type: "number" },
        protein_g: { type: "number" },
        carbs_g: { type: "number" },
        fat_g: { type: "number" },
        score: { type: "number", description: "0-100 quality score override." },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_food_log",
    description: "Delete a food log entry.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "shift_dates",
    description:
      "Bulk-shift the dates of ALL of this user's rows in one table by N days — for fixing a systemic date bug (e.g. the app logged everything a day ahead of the real day), not for a single one-off correction (use update_measurement/update_food_log for that instead).",
    input_schema: {
      type: "object",
      properties: {
        table: { type: "string", enum: ["measurements", "food_logs", "workouts"] },
        days: { type: "number", description: "Positive to move dates later, negative to move them earlier. Usually 1 or -1." },
        since: { type: "string", description: "Optional YYYY-MM-DD — only shift rows on or after this date. Omit to shift everything." },
      },
      required: ["table", "days"],
    },
  },
  {
    name: "adjust_streak",
    description: "Manually correct the user's streak/XP state after a bug threw it off.",
    input_schema: {
      type: "object",
      properties: {
        current_streak: { type: "number" },
        longest_streak: { type: "number" },
        xp: { type: "number" },
        last_checked_date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "set_rank",
    description:
      "Manually override the user's overall rank tier badge. This is a CORRECTION tool for when the displayed rank is wrong because of a bug or stale computation — it is not a way to grant a rank the user's real data doesn't support. Use your own judgment before calling this; refuse in your reply instead of calling it if the request isn't a genuine correction.",
    input_schema: {
      type: "object",
      properties: { tier: { type: "string", enum: VALID_RANK_TIERS } },
      required: ["tier"],
    },
  },
  {
    name: "reanalyze_photo",
    description: "Re-run the AI leanness/definition analysis on a specific progress photo (e.g. if the user says its score looks wrong, or it never got analyzed).",
    input_schema: {
      type: "object",
      properties: { photo_id: { type: "string", description: "The [photo id ...] shown in your context." } },
      required: ["photo_id"],
    },
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function executeTool(name: string, input: any, supabase: any, userId: string): Promise<object> {
  try {
    switch (name) {
      case "update_measurement": {
        const patch: Record<string, unknown> = {};
        if (input.logged_at) patch.logged_at = input.logged_at;
        if (input.weight_lb != null) patch.weight_lb = input.weight_lb;
        const { error } = await supabase.from("measurements").update(patch).eq("id", input.id).eq("user_id", userId);
        if (error) return { error: error.message };
        return { ok: true };
      }
      case "add_measurement": {
        const { error } = await supabase
          .from("measurements")
          .upsert(
            { user_id: userId, logged_at: input.logged_at, weight_lb: input.weight_lb },
            { onConflict: "user_id,logged_at" }
          );
        if (error) return { error: error.message };
        return { ok: true };
      }
      case "delete_measurement": {
        const { error } = await supabase.from("measurements").delete().eq("id", input.id).eq("user_id", userId);
        if (error) return { error: error.message };
        return { ok: true };
      }
      case "update_food_log": {
        const patch: Record<string, unknown> = {};
        for (const k of ["logged_at", "food_name", "calories", "protein_g", "carbs_g", "fat_g", "score"]) {
          if (input[k] != null) patch[k] = input[k];
        }
        const { error } = await supabase.from("food_logs").update(patch).eq("id", input.id).eq("user_id", userId);
        if (error) return { error: error.message };
        return { ok: true };
      }
      case "delete_food_log": {
        const { error } = await supabase.from("food_logs").delete().eq("id", input.id).eq("user_id", userId);
        if (error) return { error: error.message };
        return { ok: true };
      }
      case "shift_dates": {
        const table = input.table as "measurements" | "food_logs" | "workouts";
        const days = Number(input.days);
        if (!["measurements", "food_logs", "workouts"].includes(table) || !days) {
          return { error: "Invalid table or days" };
        }
        const dateCol = "logged_at";
        let query = supabase.from(table).select(`id, ${dateCol}`).eq("user_id", userId);
        if (input.since) query = query.gte(dateCol, input.since);
        const { data: rows, error: selectError } = await query.limit(2000);
        if (selectError) return { error: selectError.message };
        let updated = 0;
        for (const row of rows ?? []) {
          const raw = row[dateCol] as string;
          const isTimestamp = raw.includes("T");
          const d = new Date(raw);
          d.setUTCDate(d.getUTCDate() + days);
          const newValue = isTimestamp ? d.toISOString() : d.toISOString().slice(0, 10);
          const { error: updateError } = await supabase.from(table).update({ [dateCol]: newValue }).eq("id", row.id).eq("user_id", userId);
          if (!updateError) updated++;
        }
        return { ok: true, rowsShifted: updated };
      }
      case "adjust_streak": {
        const patch: Record<string, unknown> = {};
        for (const k of ["current_streak", "longest_streak", "xp", "last_checked_date"]) {
          if (input[k] != null) patch[k] = input[k];
        }
        if (Object.keys(patch).length === 0) return { error: "Nothing to change" };
        const { error } = await supabase.from("streaks").update(patch).eq("user_id", userId);
        if (error) return { error: error.message };
        return { ok: true };
      }
      case "set_rank": {
        if (!VALID_RANK_TIERS.includes(input.tier)) return { error: "Invalid tier" };
        // profiles.rank is locked against normal writes (lock_profile_admin_fields
        // trigger) — same as /api/rank, this needs the service-role client.
        const admin = createAdminClient();
        const { error } = await admin.from("profiles").update({ rank: input.tier }).eq("user_id", userId);
        if (error) return { error: error.message };
        return { ok: true };
      }
      case "reanalyze_photo": {
        const result = await analyzeProgressPhoto(supabase, anthropic, MODEL, userId, input.photo_id);
        return { ok: true, ...result };
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "Server is missing ANTHROPIC_API_KEY. Add it in your deployment's environment variables." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const { messages } = body as { messages: { role: "user" | "assistant"; content: string }[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }

  const [
    { data: goal },
    { data: measurements },
    { data: plan },
    { data: lifts },
    { data: allLifts },
    { data: photos },
    { data: foodLogs },
    { data: streak },
    { data: profile },
  ] = await Promise.all([
    supabase.from("goals").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("measurements")
      .select("id, logged_at, weight_lb")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: true })
      .returns<MeasurementRow[]>(),
    supabase.from("training_plans").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("lifts")
      .select("logged_at, lift_name, weight_lb, reps, sets")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false })
      .limit(40)
      .returns<Pick<Lift, "logged_at" | "lift_name" | "weight_lb" | "reps" | "sets">[]>(),
    // Full history (not just the recent-40 above) — the per-muscle rank's
    // qualifying-day counting needs every logged day, not a recent slice.
    supabase
      .from("lifts")
      .select("logged_at, lift_name, weight_lb, reps, sets")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: true })
      .limit(3000)
      .returns<Pick<Lift, "logged_at" | "lift_name" | "weight_lb" | "reps" | "sets">[]>(),
    supabase
      .from("progress_photos")
      .select("id, taken_at, angle, ai_leanness_score, ai_summary")
      .eq("user_id", user.id)
      .order("taken_at", { ascending: true })
      .returns<Pick<ProgressPhoto, "id" | "taken_at" | "angle" | "ai_leanness_score" | "ai_summary">[]>(),
    supabase
      .from("food_logs")
      .select("id, logged_at, food_name, calories, protein_g, score")
      .eq("user_id", user.id)
      .order("logged_at", { ascending: false })
      .limit(40)
      .returns<FoodLogRow[]>(),
    supabase
      .from("streaks")
      .select("current_streak, longest_streak, xp, last_checked_date, frozen_dates")
      .eq("user_id", user.id)
      .maybeSingle<StreakRow>(),
    supabase.from("profiles").select("rank, created_at").eq("user_id", user.id).maybeSingle<{ rank: RankTier; created_at: string }>(),
  ]);

  // The tier their DATA actually earns, computed the same way /api/rank
  // does — given to Coach alongside the stored/displayed tier so it can
  // judge a rank-change request against reality instead of taking the
  // user's word (or set_rank's own past output) at face value.
  const allLiftRows = (allLifts ?? []) as { logged_at: string; lift_name: string; weight_lb: number; reps: number }[];
  const benchMaxLb = bestValidatedMax(allLiftRows.filter((r) => isBenchName(r.lift_name)));
  const squatMaxLb = bestValidatedMax(allLiftRows.filter((r) => isSquatName(r.lift_name)));
  const weightLossPct = validatedWeightLossPct((measurements ?? []) as { logged_at: string; weight_lb: number | null }[]);
  const photoLeanGainPct = validatedPhotoLeanGainPct(
    (photos ?? []).map((p) => ({ taken_at: p.taken_at, ai_leanness_score: p.ai_leanness_score }))
  );
  const computedRankTier = computeRank({
    accountCreatedAt: profile?.created_at ?? new Date().toISOString(),
    xp: streak?.xp ?? 0,
    sex: (goal as Goal | null)?.sex ?? null,
    benchMaxLb,
    squatMaxLb,
    weightLossPct,
    photoLeanGainPct,
  });

  const system = systemPrompt(
    goal as Goal | null,
    measurements ?? [],
    plan as TrainingPlan | null,
    lifts ?? [],
    allLifts ?? [],
    photos ?? [],
    foodLogs ?? [],
    streak ?? null,
    profile?.rank ?? "newbie",
    computedRankTier
  );

  // Agentic loop: Coach can call tools that actually read/write this user's
  // own data (see TOOLS/executeTool above) instead of only chatting about
  // it. Bounded to a handful of rounds so a confused tool-call cycle can't
  // spin forever; in practice a fix is 1-2 tool calls before Coach replies
  // in plain text.
  const workingMessages: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  let reply = "Sorry, I couldn't come up with a reply.";

  try {
    for (let round = 0; round < 6; round++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1200,
        system,
        tools: TOOLS,
        messages: workingMessages,
      });

      const toolUses = response.content.filter((c): c is Anthropic.ToolUseBlock => c.type === "tool_use");

      if (toolUses.length === 0) {
        const textBlock = response.content.find((c) => c.type === "text");
        reply = textBlock && textBlock.type === "text" ? textBlock.text : reply;
        break;
      }

      workingMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const result = await executeTool(toolUse.name, toolUse.input, supabase, user.id);
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
      }
      workingMessages.push({ role: "user", content: toolResults });

      if (round === 5) {
        reply = "I made some changes but ran out of steps to summarize them — check your data and ask me to confirm anything that looks off.";
      }
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Coach is unavailable right now. Try again in a moment." }, { status: 500 });
  }
}
