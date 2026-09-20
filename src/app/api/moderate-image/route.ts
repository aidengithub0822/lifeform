import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { moderateImage } from "@/lib/moderate";
import { getModerationContext } from "@/lib/moderationAccess";
import { isOwnMediaUrl, removeOwnMedia } from "@/lib/mediaUrls";

// POST { url } — checks a just-uploaded photo (profile picture or gallery
// photo) before the client saves it anywhere public. If it fails, the file is
// deleted from storage. Community-post photos are checked inside
// /api/community itself; DM photos are private and aren't checked.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const url = typeof json?.url === "string" ? json.url : "";
  if (!url || !isOwnMediaUrl(user.id, url)) {
    return NextResponse.json({ error: "That photo link isn't valid." }, { status: 400 });
  }

  const { bypass, verified } = await getModerationContext(supabase, user.id);
  if (bypass) return NextResponse.json({ allowed: true });

  const { allowed, reason } = await moderateImage(url, { verified });
  if (!allowed) await removeOwnMedia(user.id, url);
  return NextResponse.json({ allowed, reason });
}
