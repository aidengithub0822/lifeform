import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";
import { createClient } from "@/lib/supabase/server";
import { notifyUser } from "@/lib/notify";
import type { CustomLift } from "@/lib/types";

const ACTIONS = ["approve", "deny"] as const;
type Action = (typeof ACTIONS)[number];

// POST { action: "approve" | "deny" } — the one moderation step a custom
// lift goes through before an AI-classified muscle/difficulty read becomes
// part of EVERYONE's lift catalog (approve), or is blocked from being
// resubmitted under the same name (deny). Developer-mode only.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(adminCookieName())?.value)) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action as Action | undefined;
  if (!action || !ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("custom_lifts")
    .update({
      status: action === "approve" ? "approved" : "denied",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*")
    .single<CustomLift>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Let the person who typed it know what happened to it.
  if (updated.created_by && updated.created_by !== user.id) {
    await notifyUser(updated.created_by, {
      actorId: user.id,
      actorUsername: null,
      type: "announcement",
      title:
        action === "approve"
          ? `"${updated.name}" was approved 🎉`
          : `"${updated.name}" wasn't added`,
      body:
        action === "approve"
          ? "It's now in everyone's lift list — nice find."
          : "A developer reviewed it and decided not to add it to the shared catalog. You can still log it on your own account.",
      url: "/fitness",
    });
  }

  return NextResponse.json({ item: updated });
}
