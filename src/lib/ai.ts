// Shared AI abstraction for the app. Split by capability instead of one
// do-everything provider:
//
//   - Gemini (@google/genai) handles anything that needs VISION — food
//     photo scans, physique/progress-photo analysis, photo moderation.
//   - Groq (groq-sdk, OpenAI-compatible) handles everything TEXT-ONLY —
//     Coach's chat + tool-use loop, recommend-places/fastfood/foods,
//     estimate-recipe, and text moderation.
//
// Both providers have generous free tiers that reset daily and don't expire
// (unlike the old pay-per-token Anthropic key this replaced), so this file
// has no API-key-expiry concept to manage — just GEMINI_API_KEY and
// GROQ_API_KEY in the environment.
import { GoogleGenAI, Type, ApiError as GeminiApiError, type Schema } from "@google/genai";
import Groq, { APIError as GroqAPIError } from "groq-sdk";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
export const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

let _gemini: GoogleGenAI | null = null;
export function geminiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Server is missing GEMINI_API_KEY. Add it in your deployment's environment variables.");
  }
  if (!_gemini) {
    _gemini = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        // The SDK has NO request timeout by default, and silently retries up
        // to 5 times (with exponential backoff up to 60s between attempts)
        // on 429/5xx responses. On a free-tier key that gets rate-limited
        // sometimes, that combination can turn one slow request into several
        // minutes of silent waiting before Vercel's own function timeout
        // finally kills it with an opaque 504 — exactly what made food
        // scans and photo analysis feel like they'd hung. Bound each
        // attempt to 15s and allow only one quick retry so a failure
        // surfaces in a few seconds instead of minutes.
        timeout: 15_000,
        retryOptions: { attempts: 2, initialDelay: 1, maxDelay: 3 },
      },
    });
  }
  return _gemini;
}

let _groq: Groq | null = null;
export function groqClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Server is missing GROQ_API_KEY. Add it in your deployment's environment variables.");
  }
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

export function explainAiError(err: unknown): { status: number; message: string } {
  // A per-attempt request timeout (see geminiClient's httpOptions.timeout)
  // aborts via AbortController, which surfaces as a DOMException/Error named
  // "AbortError" rather than a GeminiApiError — catch that distinctly so a
  // slow/unresponsive Gemini request still gets a quick, clear message
  // instead of falling through to the generic 500 below.
  if (err instanceof Error && (err.name === "AbortError" || /timed? ?out|timeout/i.test(err.message))) {
    return { status: 503, message: "The AI is taking too long to respond right now — try again in a moment." };
  }
  if (err instanceof GroqAPIError) {
    const s = err.status ?? 500;
    if (s === 401 || s === 403) return { status: 502, message: "The server's AI key was rejected. Check GROQ_API_KEY in your deployment settings." };
    if (s === 404) return { status: 502, message: "The AI model this app is set to use isn't available anymore. Set GROQ_MODEL to a current model." };
    if (s === 429) return { status: 503, message: "The AI is busy right now — try again in a moment." };
    if (s === 400 || s === 413) return { status: 400, message: `The AI couldn't process that request (${err.message.slice(0, 160)}). Try again.` };
    return { status: 502, message: `The AI service returned an error (${s}). Try again.` };
  }
  if (err instanceof GeminiApiError) {
    const s = err.status ?? 500;
    if (s === 401 || s === 403) return { status: 502, message: "The server's AI key was rejected. Check GEMINI_API_KEY in your deployment settings." };
    if (s === 404) return { status: 502, message: "The AI model this app is set to use isn't available anymore. Set GEMINI_MODEL to a current model." };
    if (s === 429) return { status: 503, message: "The AI is busy right now — try again in a moment." };
    if (s === 400 || s === 413) return { status: 400, message: `The AI couldn't process that request (${err.message.slice(0, 160)}). Try a different photo or description.` };
    return { status: 502, message: `The AI service returned an error (${s}). Try again.` };
  }
  if (err instanceof Error && /GEMINI_API_KEY|GROQ_API_KEY/.test(err.message)) {
    return { status: 500, message: err.message };
  }
  return { status: 500, message: "Something went wrong reaching the AI service. Try again." };
}

// ---------------------------------------------------------------------------
// Gemini: structured JSON output (with optional images), for vision tasks.
// ---------------------------------------------------------------------------

export type GeminiImagePart = { inlineData: { data: string; mimeType: string } };
export type GeminiTextPart = { text: string };
export type GeminiPart = GeminiImagePart | GeminiTextPart;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PlainSchema = any;

// Converts the same plain JSON-Schema-style objects already used throughout
// this app (lowercase "object"/"string"/"number"/"array", with
// properties/items/required/enum/description — the exact shape every
// *_TOOL.input_schema here used for Anthropic's tool-use) into Gemini's
// Schema shape (an uppercase Type enum). This means none of the existing
// tool-schema definitions needed to be rewritten for the provider swap.
export function toGeminiSchema(schema: PlainSchema): Schema {
  if (schema == null || typeof schema !== "object") return schema as Schema;
  const typeMap: Record<string, Type> = {
    object: Type.OBJECT,
    string: Type.STRING,
    number: Type.NUMBER,
    integer: Type.INTEGER,
    boolean: Type.BOOLEAN,
    array: Type.ARRAY,
  };
  const out: Schema = {};
  if (schema.type && typeMap[schema.type]) out.type = typeMap[schema.type];
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out.properties[k] = toGeminiSchema(v);
    }
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.required) out.required = schema.required;
  return out;
}

/**
 * Single-shot structured-JSON call to Gemini — the vision-task equivalent of
 * Anthropic's forced single-tool-use pattern this app used before. Pass
 * image parts via `inlineData: { data: base64, mimeType }` alongside text
 * parts, and a plain JSON-schema (same shape as an Anthropic input_schema)
 * describing the desired JSON shape.
 */
export async function geminiGenerateJSON<T = Record<string, unknown>>(opts: {
  parts: GeminiPart[];
  schema: PlainSchema;
  model?: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  // Gemini 3's "thinking" reasoning mode defaults to a high level even for a
  // plain structured-JSON extraction call like these, which made food scans
  // and photo analysis take far longer than the task needs. These calls are
  // straightforward extraction, not multi-step reasoning, so thinking is off
  // by default (thinkingBudget: 0) for speed; pass thinkingBudget to opt a
  // specific call back into some reasoning if one ever needs it.
  thinkingBudget?: number;
}): Promise<T> {
  const ai = geminiClient();
  const response = await ai.models.generateContent({
    model: opts.model || GEMINI_MODEL,
    contents: [{ role: "user", parts: opts.parts }],
    config: {
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(opts.schema),
      thinkingConfig: { thinkingBudget: opts.thinkingBudget ?? 0 },
      ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {}),
      ...(opts.maxOutputTokens ? { maxOutputTokens: opts.maxOutputTokens } : {}),
    },
  });
  const text = response.text;
  if (!text) throw new Error("The AI didn't return a result.");
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Groq: structured JSON output via a forced single function-tool call, for
// the simple text-only routes (recommend-*, estimate-recipe, text
// moderation). Groq's SDK is OpenAI-compatible, so this is the same
// JSON-schema shape as the Gemini helper above and as the old Anthropic
// tool definitions — just wrapped in OpenAI's {type:"function", function}
// tool envelope.
// ---------------------------------------------------------------------------

export async function groqGenerateJSON<T = Record<string, unknown>>(opts: {
  prompt: string;
  toolName: string;
  toolDescription: string;
  schema: PlainSchema;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}): Promise<T> {
  const groq = groqClient();
  const completion = await groq.chat.completions.create({
    model: opts.model || GROQ_MODEL,
    max_tokens: opts.maxTokens ?? 1536,
    messages: [
      ...(opts.systemPrompt ? [{ role: "system" as const, content: opts.systemPrompt }] : []),
      { role: "user" as const, content: opts.prompt },
    ],
    tools: [
      {
        type: "function",
        function: { name: opts.toolName, description: opts.toolDescription, parameters: opts.schema },
      },
    ],
    tool_choice: { type: "function", function: { name: opts.toolName } },
  });
  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== "function") throw new Error("The AI didn't return structured data.");
  return JSON.parse(toolCall.function.arguments) as T;
}

// ---------------------------------------------------------------------------
// Groq: multi-round agentic tool-calling loop, for Coach — which needs to
// inspect and execute tool calls between rounds (unlike the single-shot
// helper above), mirroring the app's existing Anthropic agentic-loop shape
// but in OpenAI/Groq message format.
// ---------------------------------------------------------------------------

export type GroqToolDef = { type: "function"; function: { name: string; description: string; parameters: PlainSchema } };

export { Groq };
