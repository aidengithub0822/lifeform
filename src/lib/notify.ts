import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { extractMentions } from "@/lib/mentions";

// Server-only. One place that turns "something happened to you" into BOTH an
// in-app notification (the row behind the bell on Home/Community, which works
// for everyone) and a push notification (only for people who installed the
// app and opted in). Push alone is why tags used to seem to do nothing.

export type NotificationType = "mention" | "reply" | "message" | "pin" | "announcement";

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
  // "@everyone" is a broadcast (developer only), never a real username lookup.
  const names = extractMentions(text)
    .filter((n) => n.toLowerCase() !== "everyone")
    .slice(0, 10);
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

const EVERYONE_RE = /(^|[^a-zA-Z0-9_])@everyone(?![a-zA-Z0-9_])/i;

/** True if the text contains a standalone "@everyone". */
export function mentionsEveryone(text: string): boolean {
  return EVERYONE_RE.test(text);
}

/**
 * Notifies everyone tagged with @username in `text`.
 *
 * Notification titles read like "anthony tagged you in post 📌" — `where` is
 * the short place name ("post", "reply", or a group chat's name).
 * "@everyone" notifies every account (or every member, when `onlyUserIds` is
 * given) but only when the caller says the author is the developer.
 */
export async function notifyMentions(opts: {
  supabase: AnySupabase;
  actorId: string;
  actorUsername: string | null;
  text: string;
  url: string;
  where: string; // short place name, e.g. "post", "reply", or the group chat's name
  exclude?: (string | null | undefined)[];
  onlyUserIds?: string[]; // restrict to these users (e.g. members of a group chat)
  allowEveryone?: boolean; // the author is the developer, so "@everyone" is honored
}): Promise<void> {
  const name = opts.actorUsername || "Someone";

  let everyoneIds: string[] = [];
  if (opts.allowEveryone && mentionsEveryone(opts.text)) {
    if (opts.onlyUserIds) {
      everyoneIds = opts.onlyUserIds.filter((id) => id !== opts.actorId);
    } else {
      try {
        const admin = createAdminClient();
        const { data } = await admin.from("profiles").select("user_id").limit(5000);
        everyoneIds = (data ?? []).map((r: { user_id: string }) => r.user_id).filter((id: string) => id !== opts.actorId);
      } catch {
        everyoneIds = [];
      }
    }
    // Send in small batches so a big user list doesn't open hundreds of push requests at once.
    for (let i = 0; i < everyoneIds.length; i += 20) {
      await Promise.all(
        everyoneIds.slice(i, i + 20).map((id) =>
          notifyUser(id, {
            actorId: opts.actorId,
            actorUsername: opts.actorUsername,
            type: "announcement",
            title: `${name} tagged everyone 📣`,
            body: opts.text,
            url: opts.url,
          })
        )
      );
    }
  }

  let ids = await resolveMentionedUserIds(opts.supabase, opts.text, [opts.actorId, ...(opts.exclude ?? [])]);
  if (opts.onlyUserIds) ids = ids.filter((id) => opts.onlyUserIds!.includes(id));
  const alreadyNotified = new Set(everyoneIds);
  ids = ids.filter((id) => !alreadyNotified.has(id));
  await Promise.all(
    ids.map((id) =>
      notifyUser(id, {
        actorId: opts.actorId,
        actorUsername: opts.actorUsername,
        type: "mention",
        title: `${name} tagged you in ${opts.where} 📌`,
        body: opts.text,
        url: opts.url,
      })
    )
  );
}
