import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";
import { createClient } from "@/lib/supabase/server";
import { notifyUser } from "@/lib/notify";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName())?.value;
  return verifyAdminToken(token);
}

// DELETE — developer-only: remove any community post by id.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("community_posts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH { message } — developer-only: edit any community post's text.
// PATCH { pinned } — developer-only: pin/unpin a post.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();

  // { pinned: boolean, minutes?: number } — pin a post to the top of the feed
  // (permanently, or for `minutes` — a timed pin also locks the post against
  // deletion by its author until the timer ends), or unpin it. The author is
  // notified when their post gets pinned.
  if (typeof body?.pinned === "boolean") {
    const admin = createAdminClient();
    const minutes =
      body.pinned && typeof body.minutes === "number" && body.minutes > 0 ? Math.min(Math.round(body.minutes), 24 * 60) : null;
    const nowIso = new Date().toISOString();
    const untilIso = minutes ? new Date(Date.now() + minutes * 60_000).toISOString() : null;
    const { error } = await admin
      .from("community_posts")
      .update({ pinned: body.pinned, pinned_at: body.pinned ? nowIso : null, pinned_until: body.pinned ? untilIso : null })
      .eq("id", id);
    if (error) {
      return NextResponse.json(
        {
          error: /pinned/.test(error.message)
            ? "Pinning needs the latest supabase/schema.sql to be run first."
            : error.message,
        },
        { status: 500 }
      );
    }

    if (body.pinned) {
      try {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const { data: post } = await admin.from("community_posts").select("user_id").eq("id", id).maybeSingle();
        const { data: actor } = user
          ? await admin.from("profiles").select("username").eq("user_id", user.id).maybeSingle()
          : { data: null };
        if (post?.user_id) {
          await notifyUser(post.user_id, {
            actorId: user?.id ?? null,
            actorUsername: (actor?.username as string | null) ?? null,
            type: "pin",
            title: minutes ? `Your post was pinned for ${minutes} min 📌` : "Your post was pinned 📌",
            body: minutes
              ? `It's locked and can't be deleted until the ${minutes}-minute timer ends.`
              : "It's now at the top of the community feed.",
            url: `/community/${id}`,
          });
        }
      } catch {
        // notification is best-effort — the pin itself already succeeded
      }
    }
    return NextResponse.json({ ok: true });
  }

  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("community_posts").update({ message }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
