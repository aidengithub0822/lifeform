import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

// POST { toUserId, title, body, url? } — fired by the client right after an
// action that another user should hear about (new DM, new follower, a
// reply). Requires a signed-in session so notifications can't be spoofed as
// coming from someone else; content is short and capped since it's shown
// verbatim in a system notification.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const json = await request.json();
  const toUserId = typeof json?.toUserId === "string" ? json.toUserId : "";
  const title = typeof json?.title === "string" ? json.title.slice(0, 80) : "";
  const bodyText = typeof json?.body === "string" ? json.body.slice(0, 180) : "";
  const url = typeof json?.url === "string" ? json.url.slice(0, 200) : undefined;

  if (!toUserId || !title || !bodyText) {
    return NextResponse.json({ error: "Missing toUserId, title, or body" }, { status: 400 });
  }
  if (toUserId === user.id) return NextResponse.json({ ok: true }); // never notify yourself

  await sendPushToUser(toUserId, { title, body: bodyText, url });
  return NextResponse.json({ ok: true });
}
