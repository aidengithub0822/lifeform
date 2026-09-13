import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929";

const MODERATION_TOOL = {
  name: "moderate_post",
  description: "Decide whether a community post or reply is allowed.",
  input_schema: {
    type: "object" as const,
    properties: {
      allowed: { type: "boolean", description: "true if the text should be published as-is" },
      reason: {
        type: "string",
        description: "If not allowed, a short (1 sentence) explanation shown to the poster so they can rephrase.",
      },
    },
    required: ["allowed", "reason"],
  },
};

/**
 * Shared AI moderation gate for anything posted to the public community
 * thread — top-level posts and replies alike. Runs BEFORE insert, so
 * nothing that fails moderation is ever stored.
 */
export async function moderate(text: string): Promise<{ allowed: boolean; reason: string }> {
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
          content: `You are the moderator for a fitness/nutrition app's public community thread, where any signed-in user can post or reply. Decide if this text should be allowed.

Block: harassment, hate speech, sexual content, spam/ads/links unrelated to fitness or nutrition, dangerous or extreme advice (e.g. promoting disordered eating, drug abuse, self-harm), and anything illegal.

Allow: normal fitness/nutrition/lifestyle discussion, questions, encouragement, off-topic-but-harmless small talk (this is a community, not a strict topic filter — only block genuinely harmful or abusive content, not just "unrelated to fitness").

Text to review:
"""
${text}
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
