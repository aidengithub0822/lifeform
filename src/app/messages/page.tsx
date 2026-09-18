"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import PullToRefresh from "@/components/PullToRefresh";
import UserName from "@/components/UserName";
import FindPeople from "@/components/FindPeople";
import Avatar from "@/components/Avatar";
import GroupMemberPicker, { type PickedUser } from "@/components/GroupMemberPicker";
import type { Message, Profile } from "@/lib/types";

interface ConversationRow {
  otherId: string;
  lastMessage: Message;
}

interface GroupRow {
  id: string;
  name: string | null;
  memberCount: number;
  lastMessage: { body: string | null; photo_url: string | null; created_at: string; sender_id: string } | null;
}

export default function MessagesInboxPage() {
  const supabase = createClient();
  const router = useRouter();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMembers, setGroupMembers] = useState<PickedUser[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

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
    loadGroups(user.id);

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

  async function loadGroups(uid: string) {
    const { data: myRows } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", uid)
      .returns<{ conversation_id: string }[]>();
    const convIds = (myRows ?? []).map((r) => r.conversation_id);
    if (convIds.length === 0) {
      setGroups([]);
      return;
    }
    const [{ data: convos }, { data: allParticipants }, { data: lastMessages }] = await Promise.all([
      supabase.from("conversations").select("id, name").in("id", convIds).returns<{ id: string; name: string | null }[]>(),
      supabase
        .from("conversation_participants")
        .select("conversation_id, user_id")
        .in("conversation_id", convIds)
        .returns<{ conversation_id: string; user_id: string }[]>(),
      supabase
        .from("conversation_messages")
        .select("conversation_id, body, photo_url, created_at, sender_id")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false })
        .returns<{ conversation_id: string; body: string | null; photo_url: string | null; created_at: string; sender_id: string }[]>(),
    ]);
    const counts: Record<string, number> = {};
    for (const p of allParticipants ?? []) counts[p.conversation_id] = (counts[p.conversation_id] ?? 0) + 1;
    const lastByConv: Record<string, GroupRow["lastMessage"]> = {};
    for (const m of lastMessages ?? []) {
      if (!lastByConv[m.conversation_id]) lastByConv[m.conversation_id] = m;
    }
    const rows: GroupRow[] = (convos ?? [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        memberCount: counts[c.id] ?? 0,
        lastMessage: lastByConv[c.id] ?? null,
      }))
      .sort((a, b) => {
        const at = a.lastMessage?.created_at ?? "";
        const bt = b.lastMessage?.created_at ?? "";
        return bt.localeCompare(at);
      });
    setGroups(rows);
  }

  async function createGroup() {
    if (!myUserId || groupMembers.length === 0) return;
    setGroupSaving(true);
    setGroupError(null);
    try {
      const { data: convo, error: convoError } = await supabase
        .from("conversations")
        .insert({ is_group: true, name: groupName.trim() || null, created_by: myUserId })
        .select("id")
        .single<{ id: string }>();
      if (convoError || !convo) throw new Error(convoError?.message || "Couldn't create the group");

      const rows = [
        { conversation_id: convo.id, user_id: myUserId, is_admin: true },
        ...groupMembers.map((m) => ({ conversation_id: convo.id, user_id: m.user_id, is_admin: false })),
      ];
      const { error: participantsError } = await supabase.from("conversation_participants").insert(rows);
      if (participantsError) throw new Error(participantsError.message);

      router.push(`/messages/group/${convo.id}`);
    } catch (err) {
      setGroupError(err instanceof Error ? err.message : "Couldn't create the group");
    } finally {
      setGroupSaving(false);
    }
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
      <div className="mt-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Messages</h1>
        <button
          onClick={() => {
            setCreatingGroup((v) => !v);
            setGroupError(null);
          }}
          className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-100 active:opacity-70"
        >
          {creatingGroup ? "Cancel" : "+ New group"}
        </button>
      </div>

      {creatingGroup && (
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm font-semibold text-zinc-300">New group</p>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (optional)"
            className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <div className="mt-3">
            <GroupMemberPicker selected={groupMembers} onChange={setGroupMembers} />
          </div>
          {groupError && <p className="mt-2 text-xs text-red-400">{groupError}</p>}
          <button
            onClick={createGroup}
            disabled={groupSaving || groupMembers.length === 0}
            className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-black disabled:opacity-40"
          >
            {groupSaving ? "Creating..." : `Create group${groupMembers.length > 0 ? ` (${groupMembers.length + 1} people)` : ""}`}
          </button>
        </div>
      )}

      {groups.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Groups</p>
          {groups.map((g) => {
            const isMine = g.lastMessage?.sender_id === myUserId;
            return (
              <Link
                key={g.id}
                href={`/messages/group/${g.id}`}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3.5 py-3 active:opacity-80"
              >
                <Avatar url={null} name={g.name ?? "G"} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-zinc-100">{g.name || `Group chat (${g.memberCount})`}</p>
                    {g.lastMessage && (
                      <p className="shrink-0 text-[11px] text-zinc-600">
                        {formatDistanceToNow(new Date(g.lastMessage.created_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                  <p className="truncate text-xs text-zinc-500">
                    {g.lastMessage ? `${isMine ? "You: " : ""}${g.lastMessage.body || "📷 Photo"}` : `${g.memberCount} members`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-5 space-y-2">
        {loading && <p className="text-sm text-zinc-500">Loading...</p>}
        {!loading && conversations.length === 0 && groups.length === 0 && (
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
                  {p ? (
                    <UserName username={p.username} color={p.name_color} verified={p.verified} rank={p.rank} className="text-sm font-semibold text-zinc-100" />
                  ) : (
                    <p className="truncate text-sm font-semibold text-zinc-100">Someone</p>
                  )}
                  <p className="shrink-0 text-[11px] text-zinc-600">
                    {formatDistanceToNow(new Date(c.lastMessage.created_at), { addSuffix: true })}
                  </p>
                </div>
                <p className="truncate text-xs text-zinc-500">
                  {isMine ? "You: " : ""}
                  {c.lastMessage.body || "📷 Photo"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-semibold text-zinc-300">Find people</h2>
        <FindPeople />
      </div>
    </div>
    </PullToRefresh>
  );
}
