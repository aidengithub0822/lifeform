import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { analyzeProgressPhoto } from "@/lib/progressPhotoAnalysis";
import { AI_MODEL } from "@/lib/ai";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = AI_MODEL;

// POST /api/progress-photos/analyze { photoId } — runs a one-time AI vision
// pass over a progress photo (see src/lib/progressPhotoAnalysis.ts for the
// actual logic, shared with Coach's reanalyze_photo tool): a 0-100
// leanness/definition score plus a short written summary, stored back on
// the row so Coach and the rank engine (see validatedPhotoLeanChangePct in
// src/lib/rank.ts) can both read a stable already-computed assessment
// instead of re-analyzing the image on every request. Called right after
// upload, and by the Progress page's backfill loop for older photos.
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

  try {
    const result = await analyzeProgressPhoto(supabase, anthropic, MODEL, user.id, photoId);
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Photo analysis failed. It's still saved — you can try again later." }, { status: 500 });
  }
}
