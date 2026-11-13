import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";
import type { CustomLift } from "@/lib/types";

// GET — every custom lift (any status), newest first, for the "type your
// lift" approval queue on /dev. Developer-mode only, same gating as
// /api/admin/users.
export async function GET() {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(adminCookieName())?.value)) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("custom_lifts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<CustomLift[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
