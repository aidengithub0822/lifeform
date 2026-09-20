"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ChevronIcon, CloseIcon } from "@/components/icons";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

function ago(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: loadError } = await supabase
      .from("notifications")
      .select("id, type, title, body, url, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(100)
      .returns<NotificationRow[]>();
    if (loadError) {
      setError("Notifications aren't set up yet — the latest supabase/schema.sql needs to be run.");
      setItems([]);
      return;
    }
    setItems(data ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function open(n: NotificationRow) {
    if (!n.read_at) {
      await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      setItems((prev) => prev?.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)) ?? prev);
    }
    if (n.url) router.push(n.url);
  }

  async function remove(id: string) {
    await supabase.from("notifications").delete().eq("id", id);
    setItems((prev) => prev?.filter((i) => i.id !== id) ?? prev);
  }

  async function markAllRead() {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    setItems((prev) => prev?.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() })) ?? prev);
  }

  const unread = (items ?? []).filter((i) => !i.read_at).length;

  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-8">
      <Link href="/community" className="flex items-center gap-1 text-sm font-medium text-zinc-400">
        <ChevronIcon className="h-4 w-4" direction="left" /> Back
      </Link>
      <div className="mt-3 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        {unread > 0 && (
          <button onClick={markAllRead} className="text-xs font-semibold text-emerald-400 active:opacity-60">
            Mark all read
          </button>
        )}
      </div>

      {error && <p className="mt-6 text-sm text-zinc-500">{error}</p>}
      {!error && items === null && <p className="mt-6 text-sm text-zinc-600">Loading…</p>}
      {!error && items?.length === 0 && (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 py-10 text-center text-sm text-zinc-600">
          Nothing yet. When someone tags you or replies to you, it shows up here.
        </p>
      )}

      <div className="mt-4 divide-y divide-zinc-900">
        {items?.map((n) => (
          <div key={n.id} className="flex items-start gap-3 py-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-emerald-400"}`} />
            <button onClick={() => open(n)} className="min-w-0 flex-1 text-left active:opacity-70">
              <p className={`text-sm ${n.read_at ? "text-zinc-400" : "font-semibold text-zinc-100"}`}>{n.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{n.body}</p>
              <p className="mt-1 text-[11px] text-zinc-600">{ago(n.created_at)}</p>
            </button>
            <button onClick={() => remove(n.id)} aria-label="Dismiss" className="shrink-0 p-1 text-zinc-600 active:text-red-400">
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
