import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyMentions } from "@/lib/notify";
import { isDeveloper } from "@/lib/moderationAccess";

// POST { text, url, conversationId? } — called by the client right after it
// saves something that the server didn't write itself (group-chat messages),
// so anyone @tagged in it gets a notification. For a group chat, only members
// of that conversation can be notified.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const text = typeof json?.text === "string" ? json.text.slice(0, 1000) : "";
  const url = typeof json?.url === "string" && json.url.startsWith("/") ? json.url.slice(0, 200) : "/";
  const conversationId = typeof json?.conversationId === "string" ? json.conversationId : null;
  if (!text.includes("@")) return NextResponse.json({ ok: true });

  const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle();

  let onlyUserIds: string[] | undefined;
  let groupName: string | null = null;
  if (conversationId) {
    const admin = createAdminClient();
    // The sender must actually be in the conversation they claim to be posting in.
    const { data: members } = await admin
      .from("conversation_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);
    onlyUserIds = (members ?? []).map((m: { user_id: string }) => m.user_id);
    if (!onlyUserIds.includes(user.id)) return NextResponse.json({ error: "Not in that conversation" }, { status: 403 });
    const { data: convo } = await admin.from("conversations").select("name").eq("id", conversationId).maybeSingle();
    groupName = (convo?.name as string | null) ?? null;
  }

  await notifyMentions({
    supabase,
    actorId: user.id,
    actorUsername: profile?.username ?? null,
    text,
    url,
    where: conversationId ? groupName || "the group chat" : "a message",
    onlyUserIds,
    allowEveryone: await isDeveloper(supabase, user.id),
  });
  return NextResponse.json({ ok: true });
}
