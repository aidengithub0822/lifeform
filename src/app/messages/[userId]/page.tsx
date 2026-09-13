"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadThread(uid: string) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`and(sender_id.eq.${uid},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${uid})`)
      .order("created_at", { ascending: true })
      .returns<Message[]>();
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

  async function send() {
    const body = draft.trim();
    if (!body || !myUserId) return;
    setSending(true);
    setDraft("");
    const optimistic: Message = {
      id: `pending-${Date.now()}`,
      sender_id: myUserId,
      recipient_id: otherId,
      body,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    const { error } = await supabase.from("messages").insert({ sender_id: myUserId, recipient_id: otherId, body });
    if (error) {
      // Roll back the optimistic message and let the user retry.
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(body);
    } else {
      fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: otherId,
          title: myUsername ? `${myUsername} sent you a message` : "New message",
          body,
          url: `/messages/${myUserId}`,
        }),
      }).catch(() => {}); // best-effort — a failed push never blocks sending the message
    }
    setSending(false);
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col px-5 py-4">
      <div className="flex items-center gap-3 border-b border-zinc-800 pb-3">
        <Link href="/messages" className="text-sm font-medium text-emerald-400">
          ← Back
        </Link>
        {otherProfile && (
          <Link href={`/profile/${otherProfile.username}`} className="ml-auto flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-100">{otherProfile.username}</span>
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
        {messages.map((m) => {
          const mine = m.sender_id === myUserId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                  mine ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-800 pt-3" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
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
          disabled={sending || !draft.trim()}
          className="rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );
}
