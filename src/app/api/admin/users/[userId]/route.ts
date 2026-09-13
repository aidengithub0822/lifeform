import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";
import { RESERVED_DEV_COLOR, isValidHexColor } from "@/lib/nameColor";

// PATCH { name_color?: string | null, verified?: boolean } — developer-mode
// only. Sets cosmetics on ANY user's profile using the service-role client,
// which is the only way these two columns can change at all (see the
// lock_profile_admin_fields trigger in schema.sql — a regular authenticated
// update to profiles is silently stripped of these fields).
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const cookieStore = await cookies();
  const isAdmin = verifyAdminToken(cookieStore.get(adminCookieName())?.value);
  if (!isAdmin) return NextResponse.json({ error: "Developer mode required" }, { status: 403 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { userId } = await params;
  const body = await request.json();
  const update: { name_color?: string | null; verified?: boolean } = {};

  if ("name_color" in body) {
    const color = body.name_color;
    if (color === null) {
      update.name_color = null;
    } else if (typeof color === "string" && color === RESERVED_DEV_COLOR) {
      // The exclusive dev gradient can only ever be granted to yourself —
      // never handed to someone else, even by another dev-mode session.
      if (userId !== user.id) {
        return NextResponse.json({ error: "That color is reserved for your own account" }, { status: 403 });
      }
      update.name_color = color;
    } else if (typeof color === "string" && isValidHexColor(color)) {
      update.name_color = color;
    } else {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    }
  }

  if ("verified" in body) {
    if (typeof body.verified !== "boolean") {
      return NextResponse.json({ error: "verified must be a boolean" }, { status: 400 });
    }
    update.verified = body.verified;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(update).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
