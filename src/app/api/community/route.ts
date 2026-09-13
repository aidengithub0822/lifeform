import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { moderate } from "@/lib/moderate";
import type { CommunityPost } from "@/lib/types";

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
  const photoUrl = typeof body?.photoUrl === "string" && body.photoUrl ? body.photoUrl : null;
  if (!message && !photoUrl) return NextResponse.json({ error: "Post can't be empty" }, { status: 400 });
  if (message.length > 1000) {
    return NextResponse.json({ error: "Keep it under 1000 characters" }, { status: 400 });
  }

  if (message) {
    const { allowed, reason } = await moderate(message);
    if (!allowed) {
      return NextResponse.json(
        { error: reason || "This post doesn't meet the community guidelines — try rephrasing." },
        { status: 422 }
      );
    }
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
    photo_url: photoUrl,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
