import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { extractMentions } from "@/lib/mentions";

// Server-only. One place that turns "something happened to you" into BOTH an
// in-app notification (the row behind the bell on Home/Community, which works
// for everyone) and a push notification (only for people who installed the
// app and opted in). Push alone is why tags used to seem to do nothing.

export type NotificationType = "mention" | "reply" | "message";

export interface NotifyInput {
  actorId: string | null;
  actorUsername: string | null;
  type: NotificationType;
  title: string;
  body: string;
  url: string;
}

export async function notifyUser(recipientId: string, n: NotifyInput): Promise<void> {
  if (!recipientId || recipientId === n.actorId) return;
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({
      user_id: recipientId,
      actor_id: n.actorId,
      actor_username: n.actorUsername,
      type: n.type,
      title: n.title,
      body: n.body.slice(0, 300),
      url: n.url,
    });
  } catch (err) {
    // Table not created yet, or no service-role key: push below still runs.
    console.error("notifyUser: couldn't write in-app notification:", err);
  }
  try {
    await sendPushToUser(recipientId, { title: n.title, body: n.body.slice(0, 160), url: n.url });
  } catch {
    // push is best-effort
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Resolves @usernames in `text` (case-insensitively — "@Anthony" finds
 * "anthony") to user ids, skipping the author and anyone in `exclude`.
 */
export async function resolveMentionedUserIds(
  supabase: AnySupabase,
  text: string,
  exclude: (string | null | undefined)[] = []
): Promise<string[]> {
  const names = extractMentions(text).slice(0, 10);
  if (names.length === 0) return [];
  const skip = new Set(exclude.filter(Boolean) as string[]);
  const found = await Promise.all(
    names.map(async (name) => {
      // `_` is a wildcard in ILIKE, so escape it and double-check in JS.
      const { data } = await supabase
        .from("profiles")
        .select("user_id, username")
        .ilike("username", name.replace(/[\\%_]/g, (c) => `\\${c}`))
        .limit(3);
      const row = (data ?? []).find(
        (p: { username: string }) => p.username.toLowerCase() === name.toLowerCase()
      );
      return row?.user_id as string | undefined;
    })
  );
  return [...new Set(found.filter((id): id is string => !!id && !skip.has(id)))];
}

/** Notifies everyone tagged with @username in `text`. */
export async function notifyMentions(opts: {
  supabase: AnySupabase;
  actorId: string;
  actorUsername: string | null;
  text: string;
  url: string;
  where: string; // e.g. "a post", "a reply", "the group chat"
  exclude?: (string | null | undefined)[];
  onlyUserIds?: string[]; // restrict to these users (e.g. members of a group chat)
}): Promise<void> {
  let ids = await resolveMentionedUserIds(opts.supabase, opts.text, [opts.actorId, ...(opts.exclude ?? [])]);
  if (opts.onlyUserIds) ids = ids.filter((id) => opts.onlyUserIds!.includes(id));
  const name = opts.actorUsername || "Someone";
  await Promise.all(
    ids.map((id) =>
      notifyUser(id, {
        actorId: opts.actorId,
        actorUsername: opts.actorUsername,
        type: "mention",
        title: `${name} tagged you`,
        body: `${name} tagged you in ${opts.where}: ${opts.text}`,
        url: opts.url,
      })
    )
  );
}
