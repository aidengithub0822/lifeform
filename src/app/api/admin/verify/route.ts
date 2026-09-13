import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminCookieName, checkAdminCode, signAdminToken } from "@/lib/adminAuth";

// POST { code } — checks the developer code (DEV_ADMIN_CODE env var, never
// committed to the repo) and, if it matches, sets an httpOnly session cookie
// unlocking developer actions (delete/edit any comment) in Settings.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!process.env.DEV_ADMIN_CODE) {
    return NextResponse.json({ error: "Developer mode isn't configured on this deployment." }, { status: 500 });
  }

  const body = await request.json();
  const code = typeof body?.code === "string" ? body.code : "";

  if (!checkAdminCode(code)) {
    return NextResponse.json({ error: "Incorrect code" }, { status: 401 });
  }

  const token = signAdminToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminCookieName(), token!, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return res;
}

// DELETE — exits developer mode by clearing the cookie.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(adminCookieName(), "", { path: "/", maxAge: 0 });
  return res;
}
