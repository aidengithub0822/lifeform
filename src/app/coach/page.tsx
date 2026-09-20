"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import CoachReply from "@/components/CoachReply";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** The static greeting: shown on screen, never saved or sent to the model. */
  local?: boolean;
}

interface ConversationRow {
  id: string;
  title: string;
  updated_at: string;
}

const STARTER_PROMPTS = [
  "What should I eat before a workout?",
  "How's my progress toward my goal?",
  "Give me a quick shoulder workout",
  "One of my log dates looks wrong — can you fix it?",
];

const GREETING: ChatMessage = {
  role: "assistant",
  local: true,
  content:
    "Hey — I'm your Coach. Ask me about nutrition, workouts, or your goals, or tell me if something in your data looks wrong (a bad date, a weird streak number, a photo score that doesn't look right) — I can fix it directly, not just explain it.",
};

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CoachPage() {
  const supabase = createClient();
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [convos, setConvos] = useState<ConversationRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadConvos(): Promise<ConversationRow[]> {
    const { data } = await supabase
      .from("coach_conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(50)
      .returns<ConversationRow[]>();
    setConvos(data ?? []);
    return data ?? [];
  }

  async function openConversation(id: string) {
    const { data, error: loadError } = await supabase
      .from("coach_messages")
      .select("role, content")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .returns<{ role: "user" | "assistant"; content: string }[]>();
    if (loadError) {
      setError("Couldn't open that chat.");
      return;
    }
    setMessages(data && data.length > 0 ? data : [GREETING]);
    setConversationId(id);
    setError(null);
    setShowHistory(false);
  }

  function newChat() {
    setMessages([GREETING]);
    setConversationId(null);
    setError(null);
    setShowHistory(false);
  }

  // Pick up where you left off: reopen the most recent saved chat.
  useEffect(() => {
    (async () => {
      const list = await loadConvos();
      if (list[0]) await openConversation(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function deleteConversation(id: string) {
    const { error: deleteError } = await supabase.from("coach_conversations").delete().eq("id", id);
    if (deleteError) {
      setError(`Couldn't delete that chat: ${deleteError.message}`);
      return;
    }
    setDeletingId(null);
    setConvos((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) newChat();
  }

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setError(null);
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    setSending(true);
    try {
      // The model gets the real conversation only (not the on-screen greeting),
      // capped to the most recent turns and always starting on a user message.
      let apiMessages = next.filter((m) => !m.local).map(({ role, content }) => ({ role, content }));
      apiMessages = apiMessages.slice(-30);
      while (apiMessages.length > 0 && apiMessages[0].role !== "user") apiMessages = apiMessages.slice(1);

      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, conversationId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Something went wrong");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: body.reply }]);
      if (body.conversationId) {
        setConversationId(body.conversationId);
        loadConvos();
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  const fresh = messages.length === 1 && messages[0].local;

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col px-5 pb-4 pt-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-emerald-400">
          ← Back
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="lf-glow h-2 w-2 rounded-full bg-emerald-400" />
          <h1 className="text-lg font-bold">Coach</h1>
        </div>
        <div className="flex items-center gap-3 text-sm font-medium text-emerald-400">
          <button onClick={newChat} aria-label="Start a new chat" className="active:opacity-60">
            New
          </button>
          <button
            onClick={() => {
              loadConvos();
              setShowHistory(true);
            }}
            aria-label="Chat history"
            className="active:opacity-60"
          >
            History
          </button>
        </div>
      </div>
      <p className="mt-0.5 text-center text-[11px] text-[#52525b]">
        Reads and can fix your data — food, training, streak, rank
      </p>

      <div className="mt-4 flex-1 space-y-3.5 overflow-y-auto pb-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user"
                  ? "whitespace-pre-wrap bg-emerald-500 text-black"
                  : "lf-ai-aura border-none bg-zinc-900 text-zinc-200"
              }`}
            >
              {m.role === "user" ? m.content : <CoachReply text={m.content} />}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="lf-ai-aura rounded-2xl bg-zinc-900 px-4 py-2.5 text-sm text-zinc-500">
              Thinking...
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {fresh && (
        <div className="mb-3 flex flex-wrap gap-2">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 active:opacity-70"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="lf-ai-aura flex shrink-0 gap-2 rounded-xl p-1 pb-[calc(env(safe-area-inset-bottom)+0.25rem)]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about food, workouts, your goals..."
          className="flex-1 rounded-lg border-none bg-zinc-900 px-4 py-3 text-sm placeholder-zinc-500 outline-none"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          Send
        </button>
      </div>

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70" onClick={() => setShowHistory(false)}>
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#1f1f23] bg-[#0d0d0f] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#f4f4f5]">Your chats</h2>
              <button onClick={newChat} className="rounded-full bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-black">
                + New chat
              </button>
            </div>
            {convos.length === 0 && (
              <p className="mt-5 text-sm text-[#71717a]">
                No saved chats yet. Your conversations with Coach are saved here automatically.
              </p>
            )}
            <div className="mt-2">
              {convos.map((c) => (
                <div key={c.id} className="flex items-center gap-3 border-b border-[#1a1a1d] py-3">
                  {deletingId === c.id ? (
                    <>
                      <p className="min-w-0 flex-1 truncate text-sm text-zinc-300">Delete this chat?</p>
                      <button onClick={() => setDeletingId(null)} className="text-xs font-medium text-[#a1a1aa]">
                        Cancel
                      </button>
                      <button
                        onClick={() => deleteConversation(c.id)}
                        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white"
                      >
                        Delete
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => openConversation(c.id)} className="min-w-0 flex-1 text-left active:opacity-70">
                        <p className={`truncate text-sm font-medium ${c.id === conversationId ? "text-emerald-400" : "text-[#f4f4f5]"}`}>
                          {c.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[#71717a]">{ago(c.updated_at)}</p>
                      </button>
                      <button
                        onClick={() => setDeletingId(c.id)}
                        aria-label={`Delete chat ${c.title}`}
                        className="shrink-0 text-xs font-medium text-[#52525b] active:text-red-400"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
