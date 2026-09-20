import Anthropic from "@anthropic-ai/sdk";

// One place for "which Claude model do the AI features use". Set
// ANTHROPIC_MODEL in the deployment env to override it. The default moved off
// claude-sonnet-4-5-20250929, which Anthropic lists as retiring on/after
// 2026-09-29 — a retired model makes every scan/coach call fail.
export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

// Tried in order if the primary model comes back "not found" (retired/renamed).
export const AI_FALLBACK_MODELS = ["claude-sonnet-4-6", "claude-sonnet-5"];

export function modelCandidates(primary: string = AI_MODEL): string[] {
  return [primary, ...AI_FALLBACK_MODELS.filter((m) => m !== primary)];
}

/** A short, user-safe explanation for a failed Anthropic API call. */
export function explainAiError(err: unknown): { status: number; message: string } {
  if (err instanceof Anthropic.APIError) {
    const s = err.status ?? 500;
    if (s === 401 || s === 403) {
      return { status: 502, message: "The server's AI key was rejected. Check ANTHROPIC_API_KEY in your deployment settings." };
    }
    if (s === 404) {
      return { status: 502, message: "The AI model this app is set to use isn't available anymore. Set ANTHROPIC_MODEL to a current model." };
    }
    if (s === 429 || s === 529) {
      return { status: 503, message: "The AI is busy right now — try again in a moment." };
    }
    if (s === 400 || s === 413) {
      return { status: 400, message: `The AI couldn't process that request (${err.message.slice(0, 160)}). Try a different photo or description.` };
    }
    return { status: 502, message: `The AI service returned an error (${s}). Try again.` };
  }
  return { status: 500, message: "Something went wrong reaching the AI service. Try again." };
}

/**
 * `anthropic.messages.create` that falls through the known-good model list if
 * the configured model has been retired (404), so a retired default can't
 * take the whole feature down.
 */
export async function createWithFallback(
  client: Anthropic,
  params: Omit<Anthropic.Messages.MessageCreateParamsNonStreaming, "model">,
  primary: string = AI_MODEL
): Promise<Anthropic.Messages.Message> {
  let lastErr: unknown = null;
  for (const model of modelCandidates(primary)) {
    try {
      return await client.messages.create({ ...params, model });
    } catch (err) {
      lastErr = err;
      if (err instanceof Anthropic.APIError && err.status === 404) continue;
      throw err;
    }
  }
  throw lastErr;
}
