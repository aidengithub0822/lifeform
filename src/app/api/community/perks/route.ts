import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canBypassModeration } from "@/lib/moderationAccess";

// GET — does this account get the developer-granted community perks
// (video posts, skipping the AI post filter)? The composer uses this to decide
// whether to show the Video button; the POST routes re-check it server-side.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ canBypass: await canBypassModeration(supabase, user.id) });
}
