import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";

// GET — tells the client whether developer mode is currently unlocked
// (valid, unexpired cookie), so Settings can show the right UI on load
// without asking the user to re-enter the code every page refresh.
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(adminCookieName())?.value;
  return NextResponse.json({ isAdmin: verifyAdminToken(token) });
}
