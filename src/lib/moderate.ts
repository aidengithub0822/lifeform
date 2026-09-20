import Anthropic from "@anthropic-ai/sdk";
import { AI_MODEL } from "@/lib/ai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = AI_MODEL;

export interface ModerationResult {
  allowed: boolean;
  reason: string;
}

export interface ModerateOptions {
  /** Verified accounts may use (non-targeted) swearing; everyone else may not. */
  verified?: boolean;
}

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

// Anything that looks like a link: a scheme, www., or a bare domain on a
// common TLD ("bit.ly/x", "cool-site.com"). Checked in code, not by the AI, so
// it's instant, free and can't be talked around.
const LINK_RE = new RegExp(
  String.raw`(https?:\/\/|www\.|\b[a-z0-9][a-z0-9-]*\.(?:com|net|org|io|co|gg|ly|me|tv|app|dev|xyz|info|biz|us|uk|ca|ru|cn|shop|store|online|site|link|to|be|fm|ai|sh|cc|ws|vip|club|live|pro|page|click|top|cash)\b)`,
  "i"
);

export function containsLink(text: string): boolean {
  return LINK_RE.test(text);
}

/**
 * Shared AI moderation gate for anything posted to the public community
 * thread — top-level posts and replies alike. Runs BEFORE insert, so
 * nothing that fails moderation is ever stored.
 *
 * The bar is deliberately low: slurs, hate speech, links, targeted abuse and
 * real safety problems are blocked; almost everything else (emojis, slang,
 * banter, dark jokes like "I'm gonna kill you", off-topic chat) is allowed.
 * Swearing is only for verified accounts.
 */
export async function moderate(text: string, opts: ModerateOptions = {}): Promise<ModerationResult> {
  const verified = opts.verified === true;

  // 1) Links are never allowed (deterministic).
  if (containsLink(text)) {
    return { allowed: false, reason: "Links aren't allowed in posts — take the link out and try again." };
  }

  // 2) No letters at all (emojis, numbers, punctuation) — nothing to judge.
  if (!/\p{L}/u.test(text)) return { allowed: true, reason: "" };

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
          content: `You are a very light-touch moderator for the public community thread of a fitness app. Your default answer is ALLOW. Only block text that clearly breaks one of the rules below.

BLOCK:
1. Slurs — any slur about race, ethnicity, nationality, religion, gender, sexuality, disability, etc., including masked or spaced-out versions (leetspeak, symbols, extra letters).
2. Hate speech — attacking, dehumanizing or demeaning people for who they are, or promoting hate groups/ideologies.
3. Targeted abuse — cursing AT a specific person or group ("you're a f***ing idiot"), bullying, or sustained harassment of someone.
4. Real safety problems — a genuine, credible threat against a real person, sharing someone's private info (address, phone, etc.), sexual content involving minors, sexual content in general, encouraging self-harm or suicide, promoting eating disorders, or instructions for serious crimes or drug abuse.
5. Links or link-like text, including disguised ones ("dot com", "h t t p"), and ads/spam/promo of other sites, accounts or products.
6. Profanity — ${
            verified
              ? "NOT a problem here: this poster is verified, so ordinary swear words are fine in moderation as long as they are NOT aimed at a person or group and the post isn't just a wall of cursing."
              : "this poster is NOT verified, so block posts that contain swear words or profanity (fuck, shit, bitch, asshole, dick, etc. — including masked versions like f*ck or sh1t). Mild words such as damn, hell, crap, suck, screw, wtf, omg, butt or 'freaking' are fine. If you block for profanity, say swearing is for verified accounts only."
          }

ALWAYS ALLOW (never block these, even if you're unsure):
- Emojis, emoticons, reactions, one-word or very short replies, slang, memes, sarcasm, and off-topic small talk.
- Jokes and hyperbole between people, including violent-sounding banter like "I'm gonna kill you", "I'll murder you at the gym", "you're dead", "this workout is killing me".
- Strong opinions, disagreement, and criticism that isn't hateful or a personal attack.
- Anything not covered by the BLOCK list above.

If you block, write one short sentence the poster can act on. When in doubt, allow.

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

const IMAGE_TOOL = {
  name: "moderate_image",
  description: "Decide whether a photo is allowed in the community.",
  input_schema: {
    type: "object" as const,
    properties: {
      allowed: { type: "boolean", description: "true if the photo may be published" },
      reason: {
        type: "string",
        description: "If not allowed, one short sentence explaining why, shown to the person who posted it.",
      },
    },
    required: ["allowed", "reason"],
  },
};

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * AI check for photos, run on the server for any picture that will appear in
 * the community feed or on a public profile. Non-verified accounts fail
 * CLOSED (if the check itself can't run, the photo is held back); verified
 * accounts fail open. `imageUrl` must already be validated as one of this
 * app's own storage URLs by the caller.
 */
export async function moderateImage(imageUrl: string, opts: ModerateOptions = {}): Promise<ModerationResult> {
  const verified = opts.verified === true;
  const unavailable: ModerationResult = verified
    ? { allowed: true, reason: "" }
    : { allowed: false, reason: "We couldn't check that photo right now — please try again in a minute." };

  if (!process.env.ANTHROPIC_API_KEY) return unavailable;

  try {
    const res = await fetch(imageUrl, { cache: "no-store" });
    if (!res.ok) return unavailable;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) {
      return { allowed: false, reason: "That photo is too large to post — try a smaller one." };
    }
    const headerType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const mediaType: ImageMediaType = (["image/jpeg", "image/png", "image/gif", "image/webp"] as const).includes(
      headerType as ImageMediaType
    )
      ? (headerType as ImageMediaType)
      : "image/jpeg";

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      tools: [IMAGE_TOOL],
      tool_choice: { type: "tool", name: "moderate_image" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: buf.toString("base64") },
            },
            {
              type: "text",
              text: `You are the photo moderator for a fitness app's public community feed and profiles. Decide whether this photo may be shown to other users.

BLOCK photos that contain:
- Nudity or sexual content (exposed genitals, breasts/nipples, sexual acts or poses, fetish content).
- Graphic violence, gore, injuries or dead bodies.
- Hateful content: hate symbols (swastikas, KKK imagery, etc.), or text/memes that use slurs or attack people for who they are.
- Content that promotes or shows self-harm, or promotes eating disorders.
- Illegal drugs or drug use, weapons pointed at someone or used to threaten.
- Harassment: images meant to mock, expose or target a specific person, or showing someone's private info.
- Anything sexual involving minors, or a minor in a sexualized context.

ALLOW everything normal: selfies, gym and workout photos, shirtless or swimwear progress and physique photos that aren't sexual, food, pets, scenery, memes, screenshots, friends, and harmless jokes. When it's borderline but not clearly one of the blocked categories, allow it.

If you block, give one short, polite sentence.`,
            },
          ],
        },
      ],
    });

    const toolUse = response.content.find((c) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") return unavailable;
    const input = toolUse.input as { allowed: boolean; reason: string };
    return {
      allowed: !!input.allowed,
      reason: input.reason || (input.allowed ? "" : "That photo doesn't meet the community guidelines."),
    };
  } catch (err) {
    console.error("Image moderation failed:", err);
    return unavailable;
  }
}
