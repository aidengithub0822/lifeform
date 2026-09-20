import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { moderate } from "@/lib/moderate";

// PATCH { message } — the author edits their own post's text. Re-moderated
// like a new post. (Developer-mode editing of anyone's post is separate:
// /api/admin/community/[id].)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const json = await request.json().catch(() => null);
  const message = typeof json?.message === "string" ? json.message.trim() : "";
  if (message.length > 1000) return NextResponse.json({ error: "Keep it under 1000 characters" }, { status: 400 });

  const { data: existing } = await supabase
    .from("community_posts")
    .select("user_id, photo_url")
    .eq("id", id)
    .maybeSingle();
  if (!existing || existing.user_id !== user.id) {
    return NextResponse.json({ error: "You can only edit your own posts" }, { status: 403 });
  }
  if (!message && !existing.photo_url) {
    return NextResponse.json({ error: "Post can't be empty" }, { status: 400 });
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

  const { data, error } = await supabase
    .from("community_posts")
    .update({ message })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Couldn't save that edit — the latest supabase/schema.sql needs to be run to allow editing." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
