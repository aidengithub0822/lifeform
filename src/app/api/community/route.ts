import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { CommunityPost } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

const MODERATION_TOOL = {
  name: "moderate_post",
  description: "Decide whether a community post is allowed.",
  input_schema: {
    type: "object" as const,
    properties: {
      allowed: { type: "boolean", description: "true if the post should be published as-is" },
      reason: {
        type: "string",
        description: "If not allowed, a short (1 sentence) explanation shown to the poster so they can rephrase.",
      },
    },
    required: ["allowed", "reason"],
  },
};

async function moderate(message: string): Promise<{ allowed: boolean; reason: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Fail open only if the key truly isn't configured — better than a
    // totally broken community feed. In practice this key is always set.
    return { allowed: true, reason: "" };
  }
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      tools: [MODERATION_TOOL],
      tool_choice: { type: "tool", name: "moderate_post" },
      messages: [
        {
          role: "user",
          content: `You are the moderator for a fitness/nutrition app's public community thread, where any signed-in user can post. Decide if this post should be allowed.

Block: harassment, hate speech, sexual content, spam/ads/links unrelated to fitness or nutrition, dangerous or extreme advice (e.g. promoting disordered eating, drug abuse, self-harm), and anything illegal.

Allow: normal fitness/nutrition/lifestyle discussion, questions, encouragement, off-topic-but-harmless small talk (this is a community, not a strict topic filter — only block genuinely harmful or abusive content, not just "unrelated to fitness").

Post to review:
"""
${message}
"""`,
        },
      ],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return { allowed: true, reason: "" };
    const input = toolUse.input as { allowed: boolean; reason: string };
    return { allowed: !!input.allowed, reason: input.reason || "" };
  } catch (err) {
    console.error("Community moderation failed:", err);
    return { allowed: true, reason: "" };
  }
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("community_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<CommunityPost[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Post can't be empty" }, { status: 400 });
  if (message.length > 1000) {
    return NextResponse.json({ error: "Keep it under 1000 characters" }, { status: 400 });
  }

  const { allowed, reason } = await moderate(message);
  if (!allowed) {
    return NextResponse.json(
      { error: reason || "This post doesn't meet the community guidelines — try rephrasing." },
      { status: 422 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("community_posts").insert({
    user_id: user.id,
    author_username: profile?.username ?? null,
    message,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
