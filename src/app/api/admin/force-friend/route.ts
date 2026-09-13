import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";

// POST { targetUserId } — developer-mode only. Forces a MUTUAL follow
// between the calling dev-mode account and the target user: dev -> target
// works through the normal RLS-scoped client (a user can always follow
// someone as themselves), but target -> dev requires the service-role
// client since RLS only lets a user insert a follow row as themselves.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const isAdmin = verifyAdminToken(cookieStore.get(adminCookieName())?.value);
  if (!isAdmin) return NextResponse.json({ error: "Developer mode required" }, { status: 403 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const targetUserId = body?.targetUserId;
  if (typeof targetUserId !== "string" || !targetUserId) {
    return NextResponse.json({ error: "Missing targetUserId" }, { status: 400 });
  }
  if (targetUserId === user.id) {
    return NextResponse.json({ error: "Can't force-friend yourself" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [a, b] = await Promise.all([
    admin.from("follows").upsert(
      { follower_id: user.id, following_id: targetUserId },
      { onConflict: "follower_id,following_id", ignoreDuplicates: true }
    ),
    admin.from("follows").upsert(
      { follower_id: targetUserId, following_id: user.id },
      { onConflict: "follower_id,following_id", ignoreDuplicates: true }
    ),
  ]);
  if (a.error) return NextResponse.json({ error: a.error.message }, { status: 500 });
  if (b.error) return NextResponse.json({ error: b.error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
