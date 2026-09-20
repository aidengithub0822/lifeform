import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { moderate } from "@/lib/moderate";
import { getModerationContext } from "@/lib/moderationAccess";

// PATCH { body } — the author edits their own reply. Re-moderated.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id, commentId } = await params;
  const json = await request.json().catch(() => null);
  const text = typeof json?.body === "string" ? json.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Reply can't be empty" }, { status: 400 });
  if (text.length > 1000) return NextResponse.json({ error: "Keep it under 1000 characters" }, { status: 400 });

  const ctx = await getModerationContext(supabase, user.id);
  const { allowed, reason } = ctx.bypass ? { allowed: true, reason: "" } : await moderate(text, { verified: ctx.verified });
  if (!allowed) {
    return NextResponse.json(
      { error: reason || "This reply doesn't meet the community guidelines — try rephrasing." },
      { status: 422 }
    );
  }

  const { data, error } = await supabase
    .from("community_comments")
    .update({ body: text })
    .eq("id", commentId)
    .eq("post_id", id)
    .eq("user_id", user.id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: "Couldn't save that edit — you can only edit your own replies, and the latest supabase/schema.sql must be run." },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}
