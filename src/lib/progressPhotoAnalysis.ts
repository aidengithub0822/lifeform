import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressPhoto } from "@/lib/types";
import { geminiGenerateJSON, GEMINI_MODEL, type GeminiPart } from "@/lib/ai";

const ANALYSIS_SCHEMA = {
  type: "object" as const,
  properties: {
    leanness_score: {
      type: "number",
      description:
        "0-100 ordinal leanness/muscle-definition score for THIS photo alone (100 = extremely lean/defined, 0 = highest visible body fat). This is a relative, comparable-over-time signal, not a body-fat-percentage estimate.",
    },
    summary: {
      type: "string",
      description:
        "2-3 encouraging, specific sentences describing what's visible (muscle definition, midsection, overall composition). If an earlier photo of the same angle was provided for comparison, explicitly call out what changed (or didn't) — be honest, not just flattering.",
    },
  },
  required: ["leanness_score", "summary"],
};

async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: "image/jpeg" | "image/png" | "image/webp" }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch photo (${res.status})`);
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "";
  const mimeType = contentType.includes("png") ? "image/png" : contentType.includes("webp") ? "image/webp" : "image/jpeg";
  return { data: Buffer.from(buf).toString("base64"), mimeType };
}

/**
 * Runs (or re-runs) the AI leanness/definition analysis for one progress
 * photo and writes the result back onto its row. Shared between
 * /api/progress-photos/analyze (called right after upload, and by the
 * Progress page's backfill loop for pre-existing photos) and Coach's
 * reanalyze_photo tool (so the user can just ask Coach to re-score a photo
 * that looks wrong, instead of that being a dead end).
 *
 * Uses the caller's own RLS-scoped supabase client (not the admin client)
 * since a user re-reading/updating their own progress_photos row is
 * already allowed by the owner_all policy — no elevated access needed.
 *
 * Runs on Gemini (vision) rather than the old Anthropic client — the
 * `model` param is kept for call-site compatibility but defaults to
 * GEMINI_MODEL when not a Gemini model name.
 */
export async function analyzeProgressPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  userId: string,
  photoId: string,
  model: string = GEMINI_MODEL
): Promise<{ ai_leanness_score: number; ai_summary: string }> {
  const { data: photo, error: photoError } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("id", photoId)
    .eq("user_id", userId)
    .maybeSingle<ProgressPhoto>();
  if (photoError || !photo) throw new Error("Photo not found");

  const { data: prior } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", userId)
    .eq("angle", photo.angle)
    .not("ai_analyzed_at", "is", null)
    .neq("id", photo.id)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProgressPhoto>();

  const current = await fetchAsBase64(photo.photo_url);
  const parts: GeminiPart[] = [];

  if (prior) {
    const earlier = await fetchAsBase64(prior.photo_url);
    parts.push(
      { text: `Earlier ${photo.angle} progress photo, taken ${prior.taken_at}:` },
      { inlineData: { data: earlier.data, mimeType: earlier.mimeType } },
      { text: `Current ${photo.angle} progress photo, taken ${photo.taken_at}:` },
      { inlineData: { data: current.data, mimeType: current.mimeType } },
      { text: "Compare the two and score the CURRENT photo's leanness/definition, calling out what changed since the earlier one." }
    );
  } else {
    parts.push(
      { text: `${photo.angle} progress photo, taken ${photo.taken_at}:` },
      { inlineData: { data: current.data, mimeType: current.mimeType } },
      { text: "This is the user's first analyzed photo from this angle — score its leanness/definition." }
    );
  }

  const result = await geminiGenerateJSON<{ leanness_score: number; summary: string }>({
    parts,
    schema: ANALYSIS_SCHEMA,
    model,
    maxOutputTokens: 600,
  });

  const clamped = Math.max(0, Math.min(100, Math.round(Number(result.leanness_score))));
  const summary = String(result.summary ?? "");

  const { error: updateError } = await supabase
    .from("progress_photos")
    .update({ ai_leanness_score: clamped, ai_summary: summary, ai_analyzed_at: new Date().toISOString() })
    .eq("id", photo.id)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  return { ai_leanness_score: clamped, ai_summary: summary };
}
