import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { moderate, moderateImage } from "@/lib/moderate";
import { getModerationContext, isDeveloper } from "@/lib/moderationAccess";
import { isOwnMediaUrl, removeOwnMedia } from "@/lib/mediaUrls";
import { notifyDevelopers, notifyMentions } from "@/lib/notify";
import type { CommunityPost } from "@/lib/types";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Pinned posts first (most recently pinned on top), then newest first.
  let { data, error } = await supabase
    .from("community_posts")
    .select("*")
    .order("pinned", { ascending: false })
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<CommunityPost[]>();

  if (error) {
    // The pinned columns don't exist until the latest schema.sql has been
    // run — fall back to plain newest-first rather than breaking the feed.
    const fallback = await supabase
      .from("community_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<CommunityPost[]>();
    data = fallback.data;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Timed pins expire on their own (the UI compares timestamps), but tidy the
  // rows up when we notice one so they stop sorting as pinned in the database.
  const nowMs = Date.now();
  const hasExpired = (data ?? []).some((p) => p.pinned && p.pinned_until && Date.parse(p.pinned_until) <= nowMs);
  if (hasExpired) {
    try {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      await createAdminClient()
        .from("community_posts")
        .update({ pinned: false, pinned_at: null, pinned_until: null })
        .eq("pinned", true)
        .lte("pinned_until", new Date(nowMs).toISOString());
    } catch {
      // cosmetic cleanup only
    }
  }
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
  const photoUrl = typeof body?.photoUrl === "string" && body.photoUrl ? body.photoUrl : null;
  const videoUrl = typeof body?.videoUrl === "string" && body.videoUrl ? body.videoUrl : null;
  if (!message && !photoUrl && !videoUrl) return NextResponse.json({ error: "Post can't be empty" }, { status: 400 });
  if (message.length > 1000) {
    return NextResponse.json({ error: "Keep it under 1000 characters" }, { status: 400 });
  }

  // The developer, and accounts the developer has approved, skip the AI post
  // filter and are the only ones who can attach a video.
  const { bypass, verified } = await getModerationContext(supabase, user.id);
  // Media must be files this user uploaded to the app's own storage bucket.
  if (photoUrl && !isOwnMediaUrl(user.id, photoUrl)) {
    return NextResponse.json({ error: "That photo link isn't valid." }, { status: 400 });
  }
  if (videoUrl) {
    if (!bypass) {
      return NextResponse.json({ error: "Video posts aren't available on your account." }, { status: 403 });
    }
    if (!isOwnMediaUrl(user.id, videoUrl)) {
      return NextResponse.json({ error: "That video link isn't valid." }, { status: 400 });
    }
  }

  if (message && !bypass) {
    const { allowed, reason } = await moderate(message, { verified });
    if (!allowed) {
      if (photoUrl) await removeOwnMedia(user.id, photoUrl);
      return NextResponse.json(
        { error: reason || "This post doesn't meet the community guidelines — try rephrasing." },
        { status: 422 }
      );
    }
  }

  // Photos are checked by AI too (developer and approved accounts skip it).
  if (photoUrl && !bypass) {
    const image = await moderateImage(photoUrl, { verified });
    if (!image.allowed) {
      await removeOwnMedia(user.id, photoUrl);
      return NextResponse.json(
        { error: image.reason || "That photo doesn't meet the community guidelines." },
        { status: 422 }
      );
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: inserted, error } = await supabase
    .from("community_posts")
    .insert({
      user_id: user.id,
      author_username: profile?.username ?? null,
      message,
      photo_url: photoUrl,
      ...(videoUrl ? { video_url: videoUrl } : {}),
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // The developer hears about every new community post.
  await notifyDevelopers({
    actorId: user.id,
    actorUsername: profile?.username ?? null,
    preview: message || (videoUrl ? "🎥 Video" : "📷 Photo"),
    url: `/community/${inserted.id}`,
  });

  if (message) {
    await notifyMentions({
      supabase,
      actorId: user.id,
      actorUsername: profile?.username ?? null,
      text: message,
      url: `/community/${inserted.id}`,
      where: "post",
      allowEveryone: await isDeveloper(supabase, user.id),
    });
  }

  return NextResponse.json({ ok: true, id: inserted.id });
}
