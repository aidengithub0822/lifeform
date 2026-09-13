import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName())?.value;
  return verifyAdminToken(token);
}

// DELETE — developer-only: remove any comment by id, bypassing RLS via the
// service-role client. (A regular user deleting their OWN comment goes
// through the normal authenticated client + the feedback_delete_own RLS
// policy instead, not this route.)
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }
  const { id } = await params;
  const admin = createAdminClient();
  const { error } = await admin.from("feedback").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PATCH { message } — developer-only: edit any comment's text.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Message can't be empty" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("feedback").update({ message }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
