import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { moderate } from "@/lib/moderate";
import type { CommunityComment } from "@/lib/types";

// GET — every reply on one community post, oldest first (thread order).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await supabase
    .from("community_comments")
    .select("*")
    .eq("post_id", id)
    .order("created_at", { ascending: true })
    .returns<CommunityComment[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// POST { body } — reply to a post. Moderated the same way as top-level posts.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const json = await request.json();
  const text = typeof json?.body === "string" ? json.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Reply can't be empty" }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Keep it under 1000 characters" }, { status: 400 });

  const { allowed, reason } = await moderate(text);
  if (!allowed) {
    return NextResponse.json(
      { error: reason || "This reply doesn't meet the community guidelines — try rephrasing." },
      { status: 422 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("community_comments").insert({
    post_id: id,
    user_id: user.id,
    author_username: profile?.username ?? null,
    body: text,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
