"use client";

import { useEffect, useRef, useState } from "react";
import { RESERVED_DEV_COLOR } from "@/lib/nameColor";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/imageUpload";
import UserName from "@/components/UserName";
import type { Message, Profile } from "@/lib/types";

export default function MessageThreadPage() {
  const params = useParams<{ userId: string }>();
  const otherId = params.userId;
  const supabase = createClient();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [otherProfile, setOtherProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedMsgId, setSelectedMsgId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadThread(uid: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${uid},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${uid})`)
      .order("created_at", { ascending: true })
      .returns<Message[]>();
    setMessages(data ?? []);
    markIncomingRead(uid);
  }

  // Read receipts: mark every message the other person sent me as read the
  // moment I have the thread open. RLS only lets me touch read_at on rows
  // addressed to me (see the messages_mark_read policy) — everything else
  // on the row is pinned by a trigger even if I tried.
  async function markIncomingRead(uid: string) {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", otherId)
      .eq("recipient_id", uid)
      .is("read_at", null);
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

      const [profileRes, myProfileRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", otherId).maybeSingle(),
        supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle(),
      ]);
      setOtherProfile(profileRes.data as Profile | null);
      setMyUsername((myProfileRes.data as { username: string } | null)?.username ?? null);

      await loadThread(user.id);
      setLoading(false);

      channel = supabase
        .channel(`thread:${user.id}:${otherId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `recipient_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new as Message;
            if (row.sender_id === otherId) {
              setMessages((prev) => [...prev, row]);
              markIncomingRead(user.id);
            }
          }
        )
        .on(
          // Lets a "Seen" indicator update live once the other person opens
          // the thread and read_at gets set on a message I sent them.
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "messages", filter: `sender_id=eq.${user.id}` },
          (payload) => {
            const row = payload.new as Message;
            if (row.recipient_id === otherId) {
              setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
            }
          }
        )
        .subscribe();
    }

    init();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherId]);

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

  // Tap one of your own messages, then "Unsend" to delete it for both sides.
  async function unsend(id: string) {
    setSendError(null);
    const { data, error } = await supabase.from("messages").delete().eq("id", id).select("id");
    if (error || !data || data.length === 0) {
      setSendError(error?.message || "Couldn't unsend that — the latest supabase/schema.sql needs to be run.");
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

    const optimistic: Message = {
      id: `pending-${Date.now()}`,
      sender_id: myUserId,
      recipient_id: otherId,
      body: body || null,
      photo_url: pendingPreview,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      let photoUrl: string | null = null;
      if (pendingPhoto) {
        const blob = await compressImageForUpload(pendingPhoto, 1600, 0.85);
        const path = `${myUserId}/messages/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from("profile-media").upload(path, blob, {
          contentType: "image/jpeg",
        });
        if (uploadError) throw new Error(uploadError.message);
        photoUrl = supabase.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
      }

      const { error } = await supabase
        .from("messages")
        .insert({ sender_id: myUserId, recipient_id: otherId, body: body || null, photo_url: photoUrl });
      if (error) throw new Error(error.message);

      fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: otherId,
          title: myUsername ? `${myUsername} sent message 🔥` : "New message 🔥",
          body: body || "📷 Photo",
          url: `/messages/${myUserId}`,
        }),
      }).catch(() => {}); // best-effort — a failed push never blocks sending the message
    } catch (err) {
      // Roll back the optimistic message and let the user retry.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
      setSendError(err instanceof Error ? err.message : "Couldn't send that");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col px-5 py-4">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
        <Link href="/messages" className="text-sm font-medium text-emerald-400">
          ← Back
        </Link>
        {otherProfile && (
          <Link href={`/profile/${otherProfile.username}`} className="ml-auto flex items-center gap-2">
            <UserName
              username={otherProfile.username}
              color={otherProfile.name_color}
              verified={otherProfile.verified}
              className="text-sm font-semibold text-zinc-100"
            />
            <div className="h-8 w-8 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
              {otherProfile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={otherProfile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-zinc-600">
                  {otherProfile.username.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
          </Link>
        )}
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-3">
        {loading && <p className="text-sm text-zinc-500">Loading...</p>}
        {!loading && messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-zinc-500">
            Say hi to {otherProfile?.username ?? "them"} 👋
          </p>
        )}
        {messages.map((m, i) => {
          const mine = m.sender_id === myUserId;
          const isLastMine = mine && i === messages.length - 1;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className="max-w-[75%] space-y-1"
                onClick={() => mine && !m.id.startsWith("pending-") && setSelectedMsgId((cur) => (cur === m.id ? null : m.id))}
              >
                {m.photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photo_url} alt="" className="max-h-72 rounded-2xl object-cover" />
                )}
                {m.body && (
                  <div
                    className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                      mine
                        ? "bg-emerald-500 text-black"
                        : otherProfile?.name_color === RESERVED_DEV_COLOR
                          ? "border border-emerald-500/30 bg-emerald-500/15 text-emerald-50"
                          : "bg-zinc-800 text-zinc-100"
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
                  <p className="pr-1 text-right text-[11px] text-zinc-500">{m.read_at ? "Seen" : "Delivered"}</p>
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
