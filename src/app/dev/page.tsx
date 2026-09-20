"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import UserName from "@/components/UserName";
import { rankMeta } from "@/lib/rank";
import { getDevSeen, setDevSeen } from "@/lib/devSeen";

interface DevUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  name_color: string | null;
  verified: boolean;
  rank: string;
  created_at: string;
  last_sign_in_at: string | null;
}

const POLL_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function ago(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "—";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function joinedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function DevPage() {
  const [users, setUsers] = useState<DevUser[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const knownIds = useRef<Set<string> | null>(null);
  const baselineTaken = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (res.status === 403) {
        setLocked(true);
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "Couldn't load users");
        return;
      }
      setError(null);
      setLocked(false);
      setNow(Date.now());
      const list = (body.users ?? []) as DevUser[];

      // Freeze "what you'd already seen" the first time we load, so the NEW
      // markers stay put for the whole visit even though we then advance the
      // seen-marker (which is what clears the nav badge).
      if (!baselineTaken.current) {
        baselineTaken.current = true;
        setBaseline(getDevSeen());
      }

      if (knownIds.current) {
        const fresh = list.filter((u) => !knownIds.current!.has(u.user_id));
        if (fresh.length > 0) {
          setToast(
            fresh.length === 1
              ? `New user joined: @${fresh[0].username}`
              : `${fresh.length} new users joined: ${fresh.map((u) => "@" + u.username).join(", ")}`
          );
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 10_000);
        }
      }
      knownIds.current = new Set(list.map((u) => u.user_id));
      setUsers(list);
      if (list[0] && getDevSeen() !== list[0].created_at) setDevSeen(list[0].created_at);
    } catch {
      setError("Couldn't reach the server");
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [load]);

  const baselineMs = baseline ? Date.parse(baseline) : NaN;
  const isNew = (u: DevUser) => {
    const created = Date.parse(u.created_at);
    return now - created < DAY_MS || (Number.isFinite(baselineMs) && created > baselineMs);
  };
  const newSinceVisit = users && Number.isFinite(baselineMs) ? users.filter((u) => Date.parse(u.created_at) > baselineMs) : [];
  const last24h = users ? users.filter((u) => now - Date.parse(u.created_at) < DAY_MS).length : 0;
  const last7d = users ? users.filter((u) => now - Date.parse(u.created_at) < 7 * DAY_MS).length : 0;

  const q = query.trim().toLowerCase();
  const shown = (users ?? []).filter((u) => !q || u.username.toLowerCase().includes(q));

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      {toast && (
        <div className="fixed inset-x-0 top-3 z-50 mx-auto w-[calc(100%-2rem)] max-w-md">
          <button
            onClick={() => setToast(null)}
            className="flex w-full items-center gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-left text-sm font-semibold text-emerald-300 shadow-lg backdrop-blur"
          >
            <span>🎉</span>
            <span className="min-w-0 flex-1 break-words">{toast}</span>
          </button>
        </div>
      )}

      <h1 className="text-2xl font-bold">Dev</h1>
      <p className="mt-1 text-sm text-zinc-400">Everyone with a profile in lifeform. Only visible in developer mode.</p>

      {locked && (
        <div className="mt-6 rounded-2xl border border-[#1f1f23] bg-[#111113] p-4">
          <p className="text-sm font-semibold text-[#e4e4e7]">Developer mode is off</p>
          <p className="mt-1 text-xs text-[#71717a]">
            Open the menu → Developer, enter your developer code, then come back here.{" "}
            <Link href="/" className="font-medium text-emerald-400">
              Go home
            </Link>
          </p>
        </div>
      )}

      {error && !locked && <p className="mt-4 text-sm text-red-400">{error}</p>}

      {!locked && !users && !error && <p className="mt-8 text-center text-sm text-zinc-500">Loading users…</p>}

      {users && (
        <>
          {newSinceVisit.length > 0 && (
            <div className="mt-5 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
              <p className="text-sm font-semibold text-emerald-300">
                {newSinceVisit.length} new {newSinceVisit.length === 1 ? "user" : "users"} since your last visit
              </p>
              <p className="mt-0.5 text-xs text-emerald-200/70">
                {newSinceVisit
                  .slice(0, 6)
                  .map((u) => "@" + u.username)
                  .join(", ")}
                {newSinceVisit.length > 6 ? ` +${newSinceVisit.length - 6} more` : ""}
              </p>
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2.5">
            {[
              { label: "Total", value: users.length },
              { label: "Last 24h", value: last24h },
              { label: "Last 7 days", value: last7d },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-[#1f1f23] bg-[#111113] px-3 py-3 text-center">
                <p className="text-xl font-bold text-[#f4f4f5]">{s.value}</p>
                <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-[#71717a]">{s.label}</p>
              </div>
            ))}
          </div>

          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search usernames"
            className="mt-5 w-full rounded-xl border border-[#27272a] bg-[#111113] px-3.5 py-2.5 text-sm outline-none focus:border-emerald-500"
          />

          <div className="mt-3 divide-y divide-[#1a1a1d] rounded-2xl border border-[#1f1f23] bg-[#0d0d0f]">
            {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-500">No users match.</p>}
            {shown.map((u) => {
              const meta = rankMeta(u.rank);
              return (
                <Link
                  key={u.user_id}
                  href={`/profile/${encodeURIComponent(u.username)}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Avatar url={u.avatar_url} name={u.username} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <UserName
                        username={u.username}
                        color={u.name_color}
                        verified={u.verified}
                        rank={u.rank}
                        className="text-sm font-semibold text-[#f4f4f5]"
                      />
                      {isNew(u) && (
                        <span className="shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black">
                          New
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[#71717a]">
                      Joined {joinedLabel(u.created_at)} · {ago(u.created_at)}
                    </p>
                    <p className="truncate text-[11px] text-[#52525b]">Last sign-in {ago(u.last_sign_in_at)}</p>
                  </div>
                  <span
                    className="shrink-0 text-[10px] font-bold uppercase tracking-wide"
                    style={{ color: meta.color ?? "#71717a" }}
                  >
                    {meta.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
