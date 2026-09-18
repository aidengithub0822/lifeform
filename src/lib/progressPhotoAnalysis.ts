import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProgressPhoto } from "@/lib/types";

const ANALYZE_TOOL = {
  name: "log_photo_analysis",
  description: "Report a leanness/definition assessment of the physique shown in a progress photo.",
  input_schema: {
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
  },
};

async function fetchAsBase64(url: string): Promise<{ data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch photo (${res.status})`);
  const buf = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "";
  const mediaType = contentType.includes("png") ? "image/png" : contentType.includes("webp") ? "image/webp" : "image/jpeg";
  return { data: Buffer.from(buf).toString("base64"), mediaType };
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
 */
export async function analyzeProgressPhoto(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  anthropic: Anthropic,
  model: string,
  userId: string,
  photoId: string
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
  const content: Anthropic.Messages.ContentBlockParam[] = [];

  if (prior) {
    const earlier = await fetchAsBase64(prior.photo_url);
    content.push(
      { type: "text", text: `Earlier ${photo.angle} progress photo, taken ${prior.taken_at}:` },
      { type: "image", source: { type: "base64", media_type: earlier.mediaType, data: earlier.data } },
      { type: "text", text: `Current ${photo.angle} progress photo, taken ${photo.taken_at}:` },
      { type: "image", source: { type: "base64", media_type: current.mediaType, data: current.data } },
      {
        type: "text",
        text: "Compare the two and score the CURRENT photo's leanness/definition, calling out what changed since the earlier one.",
      }
    );
  } else {
    content.push(
      { type: "text", text: `${photo.angle} progress photo, taken ${photo.taken_at}:` },
      { type: "image", source: { type: "base64", media_type: current.mediaType, data: current.data } },
      { type: "text", text: "This is the user's first analyzed photo from this angle — score its leanness/definition." }
    );
  }

  const message = await anthropic.messages.create({
    model,
    max_tokens: 600,
    tools: [ANALYZE_TOOL],
    tool_choice: { type: "tool", name: "log_photo_analysis" },
    messages: [{ role: "user", content }],
  });

  const toolUse = message.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") throw new Error("Model did not return structured data");
  const { leanness_score, summary } = toolUse.input as { leanness_score: number; summary: string };
  const clamped = Math.max(0, Math.min(100, Math.round(leanness_score)));

  const { error: updateError } = await supabase
    .from("progress_photos")
    .update({ ai_leanness_score: clamped, ai_summary: summary, ai_analyzed_at: new Date().toISOString() })
    .eq("id", photo.id)
    .eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);

  return { ai_leanness_score: clamped, ai_summary: summary };
}
