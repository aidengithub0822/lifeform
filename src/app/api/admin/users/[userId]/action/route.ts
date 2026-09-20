import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";

// POST { action } — developer-mode only moderation of any account, done with
// the service-role client (nothing here is reachable without a valid signed
// `lf_admin` cookie from /api/admin/verify).
//
//   kick            ban for 24 hours (they can't sign in or refresh a session)
//   ban             ban indefinitely
//   unban           lift a kick/ban
//   reset_username  replace their username with a neutral placeholder (they can pick a new one in Settings)
//   clear_avatar    remove their profile photo
//   clear_bio       remove their bio
//   purge_content   delete every community post and reply they've written
//   delete_account  permanently delete the account and everything tied to it
//   grant_bypass    let them skip the AI post filter and post videos
//   revoke_bypass   take that back
//
// Never allowed against your own account.
const ACTIONS = [
  "kick",
  "ban",
  "unban",
  "reset_username",
  "clear_avatar",
  "clear_bio",
  "purge_content",
  "delete_account",
  "grant_bypass",
  "revoke_bypass",
] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(adminCookieName())?.value)) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { userId } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action as Action | undefined;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (userId === user.id) {
    return NextResponse.json({ error: "You can't do that to your own account." }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    switch (action) {
      case "kick":
      case "ban":
      case "unban": {
        const ban_duration = action === "kick" ? "24h" : action === "ban" ? "876000h" : "none";
        const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration });
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case "reset_username": {
        let placeholder = "";
        let lastError: string | null = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          placeholder = `user_${randomBytes(3).toString("hex")}`;
          const { error } = await admin.from("profiles").update({ username: placeholder }).eq("user_id", userId);
          if (!error) {
            lastError = null;
            break;
          }
          lastError = error.message;
        }
        if (lastError) return NextResponse.json({ error: lastError }, { status: 500 });
        // Posts and replies carry a copy of the author's name — keep them in step.
        await admin.from("community_posts").update({ author_username: placeholder }).eq("user_id", userId);
        await admin.from("community_comments").update({ author_username: placeholder }).eq("user_id", userId);
        return NextResponse.json({ ok: true, username: placeholder });
      }

      case "clear_avatar":
      case "clear_bio": {
        const patch = action === "clear_avatar" ? { avatar_url: null } : { bio: null };
        const { error } = await admin.from("profiles").update(patch).eq("user_id", userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case "purge_content": {
        const c = await admin.from("community_comments").delete().eq("user_id", userId);
        if (c.error) return NextResponse.json({ error: c.error.message }, { status: 500 });
        const p = await admin.from("community_posts").delete().eq("user_id", userId);
        if (p.error) return NextResponse.json({ error: p.error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case "delete_account": {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }

      case "grant_bypass":
      case "revoke_bypass": {
        const { error } = await admin
          .from("profiles")
          .update({ bypass_moderation: action === "grant_bypass" })
          .eq("user_id", userId);
        if (error) {
          return NextResponse.json(
            { error: /bypass_moderation/.test(error.message) ? "This needs the latest supabase/schema.sql to be run first." : error.message },
            { status: 500 }
          );
        }
        return NextResponse.json({ ok: true });
      }
    }
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
