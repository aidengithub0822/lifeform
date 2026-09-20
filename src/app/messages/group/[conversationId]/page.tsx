"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/imageUpload";
import Avatar from "@/components/Avatar";
import UserName from "@/components/UserName";
import GroupMemberPicker, { type PickedUser } from "@/components/GroupMemberPicker";
import type { Conversation, ConversationMessage } from "@/lib/types";

interface Member {
  user_id: string;
  is_admin: boolean;
  username: string;
  avatar_url: string | null;
  name_color: string | null;
  verified: boolean;
  rank: string;
}

export default function GroupThreadPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = params.conversationId;
  const supabase = createClient();
  const router = useRouter();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [convo, setConvo] = useState<Conversation | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [reads, setReads] = useState<Record<string, string>>({}); // user_id -> last_read_at
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [showMembers, setShowMembers] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [addingMembers, setAddingMembers] = useState(false);
  const [newMembers, setNewMembers] = useState<PickedUser[]>([]);
  const [membersError, setMembersError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const myMembership = members.find((m) => m.user_id === myUserId);
  const isAdmin = !!myMembership?.is_admin;

  async function loadMembers() {
    const { data: participantRows } = await supabase
      .from("conversation_participants")
      .select("user_id, is_admin")
      .eq("conversation_id", conversationId)
      .returns<{ user_id: string; is_admin: boolean }[]>();
    const ids = (participantRows ?? []).map((p) => p.user_id);
    if (ids.length === 0) {
      setMembers([]);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url, name_color, verified, rank")
      .in("user_id", ids)
      .returns<{ user_id: string; username: string; avatar_url: string | null; name_color: string | null; verified: boolean; rank: string }[]>();
    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    setMembers(
      (participantRows ?? []).map((p) => {
        const prof = profileMap.get(p.user_id);
        return {
          user_id: p.user_id,
          is_admin: p.is_admin,
          username: prof?.username ?? "someone",
          avatar_url: prof?.avatar_url ?? null,
          name_color: prof?.name_color ?? null,
          verified: prof?.verified ?? false,
          rank: prof?.rank ?? "newbie",
        };
      })
    );
  }

  async function loadReads() {
    const { data } = await supabase
      .from("conversation_reads")
      .select("user_id, last_read_at")
      .eq("conversation_id", conversationId)
      .returns<{ user_id: string; last_read_at: string }[]>();
    const map: Record<string, string> = {};
    for (const r of data ?? []) map[r.user_id] = r.last_read_at;
    setReads(map);
  }

  async function markRead(uid: string) {
    await supabase
      .from("conversation_reads")
      .upsert(
        { conversation_id: conversationId, user_id: uid, last_read_at: new Date().toISOString() },
        { onConflict: "conversation_id,user_id" }
      );
  }

  async function loadMessages() {
    const { data } = await supabase
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .returns<ConversationMessage[]>();
    setMessages(data ?? []);
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      setMyUserId(user.id);

      const [{ data: myProfile }, { data: convoRow }] = await Promise.all([
        supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle<{ username: string }>(),
        supabase.from("conversations").select("*").eq("id", conversationId).maybeSingle<Conversation>(),
      ]);
      setMyUsername(myProfile?.username ?? null);
      if (!convoRow) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setConvo(convoRow);
      setNameDraft(convoRow.name ?? "");

      await Promise.all([loadMembers(), loadMessages(), loadReads()]);
      await markRead(user.id);
      setLoading(false);

      channel = supabase
        .channel(`group:${conversationId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "conversation_messages", filter: `conversation_id=eq.${conversationId}` },
          (payload) => {
            const row = payload.new as ConversationMessage;
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
            if (row.sender_id !== user.id) markRead(user.id).then(() => loadReads());
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "conversation_reads", filter: `conversation_id=eq.${conversationId}` },
          () => loadReads()
        )
        .subscribe();
    }

    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function pickPhoto(file: File) {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // Tap one of your own messages, then "Unsend" to delete it for everyone.
  async function unsend(id: string) {
    setSendError(null);
    const { data, error } = await supabase.from("conversation_messages").delete().eq("id", id).select("id");
    if (error || !data || data.length === 0) {
      setSendError(error?.message || "Couldn't unsend that message.");
      return;
    }
    setSelectedMsgId(null);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }

  async function send() {
    const body = draft.trim();
    if ((!body && !photoFile) || !myUserId) return;
    setSending(true);
    setSendError(null);
    setDraft("");
    const pendingPhoto = photoFile;
    const pendingPreview = photoPreview;
    clearPhoto();

    const optimistic: ConversationMessage = {
      id: `pending-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: myUserId,
      sender_username: myUsername,
      body: body || null,
      photo_url: pendingPreview,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      let photoUrl: string | null = null;
      if (pendingPhoto) {
        const blob = await compressImageForUpload(pendingPhoto, 1600, 0.85);
        const path = `${myUserId}/group-messages/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from("profile-media").upload(path, blob, {
          contentType: "image/jpeg",
        });
        if (uploadError) throw new Error(uploadError.message);
        photoUrl = supabase.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase.from("conversation_messages").insert({
        conversation_id: conversationId,
        sender_id: myUserId,
        sender_username: myUsername,
        body: body || null,
        photo_url: photoUrl,
      });
      if (error) throw new Error(error.message);
      await markRead(myUserId);

      const title = myUsername ? `${myUsername} in ${convo?.name || "your group"}` : "New group message";
      for (const m of members) {
        if (m.user_id === myUserId) continue;
        fetch("/api/push/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toUserId: m.user_id, title, body: body || "📷 Photo", url: `/messages/group/${conversationId}` }),
        }).catch(() => {});
      }
      // Anyone @tagged in the message also gets an in-app "tagged you" notification.
      if (body.includes("@")) {
        fetch("/api/mentions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body, url: `/messages/group/${conversationId}`, conversationId }),
        }).catch(() => {});
      }
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      setSendError(err instanceof Error ? err.message : "Couldn't send that");
    } finally {
      setSending(false);
    }
  }

  async function saveName() {
    const next = nameDraft.trim();
    await supabase.from("conversations").update({ name: next || null }).eq("id", conversationId);
    setConvo((c) => (c ? { ...c, name: next || null } : c));
    setRenaming(false);
  }

  async function toggleAdmin(userId: string, makeAdmin: boolean) {
    await supabase
      .from("conversation_participants")
      .update({ is_admin: makeAdmin })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);
    await loadMembers();
  }

  async function removeMember(userId: string) {
    await supabase.from("conversation_participants").delete().eq("conversation_id", conversationId).eq("user_id", userId);
    await loadMembers();
  }

  async function leaveGroup() {
    if (!myUserId) return;
    await removeMember(myUserId);
    router.push("/messages");
  }

  async function addMembers() {
    if (newMembers.length === 0) return;
    setMembersError(null);
    const { error } = await supabase
      .from("conversation_participants")
      .insert(newMembers.map((m) => ({ conversation_id: conversationId, user_id: m.user_id, is_admin: false })));
    if (error) {
      setMembersError(error.message);
      return;
    }
    setNewMembers([]);
    setAddingMembers(false);
    await loadMembers();
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-5 py-8">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (notFound || !convo) {
    return (
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/messages" className="text-sm font-medium text-emerald-400">
          ← Back
        </Link>
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
          This group isn&apos;t here anymore.
        </p>
      </div>
    );
  }

  const memberIds = members.map((m) => m.user_id);

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col px-5 py-4">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
        <Link href="/messages" className="text-sm font-medium text-emerald-400">
          ← Back
        </Link>
        <button onClick={() => setShowMembers((v) => !v)} className="ml-auto flex items-center gap-2">
          <p className="text-sm font-semibold text-zinc-100">{convo.name || `Group chat (${members.length})`}</p>
        </button>
      </div>

      {showMembers && (
        <div className="max-h-[70vh] overflow-y-auto border-b border-zinc-800 py-3">
          {isAdmin && (
            <div className="mb-3 flex items-center gap-2">
              {renaming ? (
                <>
                  <input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Group name"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
                  />
                  <button onClick={saveName} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black">
                    Save
                  </button>
                </>
              ) : (
                <button onClick={() => setRenaming(true)} className="text-xs font-medium text-zinc-400">
                  Rename group
                </button>
              )}
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{members.length} members</p>
          <div className="mt-2 space-y-1.5">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-2.5 rounded-xl px-1 py-1.5">
                <Avatar url={m.avatar_url} name={m.username} size={30} />
                <UserName username={m.username} color={m.name_color} verified={m.verified} rank={m.rank} className="text-sm font-medium" />
                {m.is_admin && <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">Admin</span>}
                {isAdmin && m.user_id !== myUserId && (
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => toggleAdmin(m.user_id, !m.is_admin)} className="text-[11px] font-medium text-zinc-500">
                      {m.is_admin ? "Remove admin" : "Make admin"}
                    </button>
                    <button onClick={() => removeMember(m.user_id)} className="text-[11px] font-medium text-red-400">
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {isAdmin && (
            <div className="mt-3">
              {addingMembers ? (
                <div>
                  <GroupMemberPicker selected={newMembers} onChange={setNewMembers} excludeIds={memberIds} />
                  {membersError && <p className="mt-1 text-xs text-red-400">{membersError}</p>}
                  <div className="mt-2 flex gap-2">
                    <button onClick={addMembers} disabled={newMembers.length === 0} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-40">
                      Add
                    </button>
                    <button onClick={() => setAddingMembers(false)} className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingMembers(true)} className="text-xs font-semibold text-emerald-400">
                  + Add members
                </button>
              )}
            </div>
          )}

          <button onClick={leaveGroup} className="mt-4 text-xs font-medium text-red-400">
            Leave group
          </button>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto py-3">
        {messages.length === 0 && <p className="mt-8 text-center text-sm text-zinc-500">No messages yet — say hi 👋</p>}
        {messages.map((m, i) => {
          const mine = m.sender_id === myUserId;
          const isLastMine = mine && i === messages.length - 1;
          const seenBy = isLastMine
            ? members.filter((mem) => mem.user_id !== myUserId && reads[mem.user_id] && reads[mem.user_id] >= m.created_at)
            : [];
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[75%] space-y-1"
                onClick={() => mine && !m.id.startsWith("pending-") && setSelectedMsgId((cur) => (cur === m.id ? null : m.id))}
              >
                {!mine && <p className="pl-1 text-[11px] font-medium text-zinc-500">{m.sender_username ?? "someone"}</p>}
                {m.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photo_url} alt="" className="max-h-72 rounded-2xl object-cover" />
                )}
                {m.body && (
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                      mine ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-100"
                    }`}
                  >
                    {m.body}
                  </div>
                )}
                {mine && selectedMsgId === m.id && (
                  <div className="flex justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        unsend(m.id);
                      }}
                      className="rounded-full bg-red-600/90 px-3 py-1 text-xs font-semibold text-white"
                    >
                      Unsend
                    </button>
                  </div>
                )}
                {isLastMine && (
                  <p className="pr-1 text-right text-[11px] text-zinc-500">
                    {seenBy.length > 0 ? `Seen by ${seenBy.map((s) => s.username).join(", ")}` : "Delivered"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-800 pt-3" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {sendError && <p className="mb-1.5 text-xs text-red-400">{sendError}</p>}
        {photoPreview && (
          <div className="relative mb-2 w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoPreview} alt="" className="h-16 w-16 rounded-xl object-cover" />
            <button
              onClick={clearPhoto}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-base active:opacity-70">
            📷
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
            />
          </label>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Message..."
            className="flex-1 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={send}
            disabled={sending || (!draft.trim() && !photoFile)}
            className="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
