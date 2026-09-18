"use client";

import { useRef, useState } from "react";
import Link from "next/link";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const STARTER_PROMPTS = [
  "What should I eat before a workout?",
  "How's my progress toward my goal?",
  "Give me a quick shoulder workout",
  "One of my log dates looks wrong — can you fix it?",
];

export default function CoachPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hey — I'm your Coach. Ask me about nutrition, workouts, or your goals, or tell me if something in your data looks wrong (a bad date, a weird streak number, a photo score that doesn't look right) — I can fix it directly, not just explain it.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function send(text?: string) {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setError(null);
    const next = [...messages, { role: "user" as const, content: message }];
    setMessages(next);
    setSending(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Something went wrong");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: body.reply }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col px-5 pb-4 pt-6">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm font-medium text-emerald-400">
          ← Back
        </Link>
        <h1 className="text-lg font-bold">Coach</h1>
        <span className="w-10" />
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pb-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                m.role === "user" ? "bg-emerald-500 text-black" : "border border-zinc-800 bg-zinc-900 text-zinc-200"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-500">
              Thinking...
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div ref={bottomRef} />
      </div>

      {messages.length === 1 && (
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

      <div className="flex shrink-0 gap-2 pb-[env(safe-area-inset-bottom)]">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Ask about food, workouts, your goals..."
          className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm placeholder-zinc-500 outline-none focus:border-emerald-500"
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );
}
