import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { ProgressPhoto } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

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

// POST /api/progress-photos/analyze { photoId } — runs a one-time AI vision
// pass over a progress photo right after upload: a 0-100 leanness/definition
// score plus a short written summary, stored back on the row so Coach and
// the rank engine (see validatedPhotoLeanChangePct in src/lib/rank.ts) can
// both read a stable already-computed assessment instead of re-analyzing
// the image on every request. When an earlier analyzed photo of the same
// angle exists, it's included too so the model can compare directly instead
// of judging each photo in isolation.
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
  const { photoId } = body as { photoId?: string };
  if (!photoId) return NextResponse.json({ error: "No photoId provided" }, { status: 400 });

  const { data: photo, error: photoError } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("id", photoId)
    .eq("user_id", user.id)
    .maybeSingle<ProgressPhoto>();
  if (photoError || !photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });

  // Most recent OTHER analyzed photo of the same angle, for a direct
  // before/after comparison instead of judging this photo in isolation.
  const { data: prior } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", user.id)
    .eq("angle", photo.angle)
    .not("ai_analyzed_at", "is", null)
    .neq("id", photo.id)
    .order("taken_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProgressPhoto>();

  try {
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
      model: MODEL,
      max_tokens: 600,
      tools: [ANALYZE_TOOL],
      tool_choice: { type: "tool", name: "log_photo_analysis" },
      messages: [{ role: "user", content }],
    });

    const toolUse = message.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return NextResponse.json({ error: "Model did not return structured data" }, { status: 502 });
    }
    const { leanness_score, summary } = toolUse.input as { leanness_score: number; summary: string };
    const clamped = Math.max(0, Math.min(100, Math.round(leanness_score)));

    const { error: updateError } = await supabase
      .from("progress_photos")
      .update({ ai_leanness_score: clamped, ai_summary: summary, ai_analyzed_at: new Date().toISOString() })
      .eq("id", photo.id)
      .eq("user_id", user.id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ ai_leanness_score: clamped, ai_summary: summary });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Photo analysis failed. It's still saved — you can try again later." }, { status: 500 });
  }
}
