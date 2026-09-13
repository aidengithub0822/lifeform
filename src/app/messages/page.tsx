"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import PullToRefresh from "@/components/PullToRefresh";
import type { Message, Profile } from "@/lib/types";

interface ConversationRow {
  otherId: string;
  lastMessage: Message;
}

export default function MessagesInboxPage() {
  const supabase = createClient();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setMyUserId(user.id);

    const { data: rows } = await supabase
      .from("messages")
      .select("*")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<Message[]>();

    const seen = new Set<string>();
    const convos: ConversationRow[] = [];
    for (const m of rows ?? []) {
      const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
      if (seen.has(otherId)) continue;
      seen.add(otherId);
      convos.push({ otherId, lastMessage: m });
    }
    setConversations(convos);

    if (convos.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("*")
        .in("user_id", convos.map((c) => c.otherId))
        .returns<Profile[]>();
      const map: Record<string, Profile> = {};
      for (const p of profs ?? []) map[p.user_id] = p;
      setProfiles(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    load();

    let channel: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      channel = supabase
        .channel(`inbox:${uid}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${uid}` },
          () => load()
        )
        .subscribe();
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PullToRefresh onRefresh={load}>
    <div className="mx-auto max-w-md px-5 py-8">
      <Link href="/" className="text-sm font-medium text-emerald-400">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Messages</h1>

      <div className="mt-5 space-y-2">
        {loading && <p className="text-sm text-zinc-500">Loading...</p>}
        {!loading && conversations.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
            No conversations yet — message someone from their profile.
          </p>
        )}
        {conversations.map((c) => {
          const p = profiles[c.otherId];
          const isMine = c.lastMessage.sender_id === myUserId;
          return (
            <Link
              key={c.otherId}
              href={`/messages/${c.otherId}`}
              className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-3 active:opacity-80"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-950">
                {p?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-bold text-zinc-600">
                    {(p?.username ?? "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-zinc-100">{p?.username ?? "Someone"}</p>
                  <p className="shrink-0 text-[11px] text-zinc-600">
                    {formatDistanceToNow(new Date(c.lastMessage.created_at), { addSuffix: true })}
                  </p>
                </div>
                <p className="truncate text-xs text-zinc-500">
                  {isMine ? "You: " : ""}
                  {c.lastMessage.body}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
    </PullToRefresh>
  );
}
