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
  bypass_moderation: boolean;
  banned_until: string | null;
}

type UserAction =
  | "kick"
  | "ban"
  | "unban"
  | "reset_username"
  | "clear_avatar"
  | "clear_bio"
  | "purge_content"
  | "delete_account"
  | "grant_bypass"
  | "revoke_bypass";

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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
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

  async function runAction(u: DevUser, action: UserAction, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusyAction(`${u.user_id}:${action}`);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${u.user_id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionMsg(body.error || "That didn't work");
        return;
      }
      setActionMsg(action === "delete_account" ? `Deleted @${u.username}` : `Done — @${u.username}`);
      if (action === "delete_account") setExpanded(null);
      await load();
    } catch {
      setActionMsg("Couldn't reach the server");
    } finally {
      setBusyAction(null);
    }
  }

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
              const open = expanded === u.user_id;
              const banned = !!u.banned_until;
              const btn = "rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50";
              const busy = (a: UserAction) => busyAction === `${u.user_id}:${a}`;
              return (
                <div key={u.user_id}>
                  <button
                    onClick={() => {
                      setExpanded(open ? null : u.user_id);
                      setActionMsg(null);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <Avatar url={u.avatar_url} name={u.username} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
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
                        {banned && (
                          <span className="shrink-0 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                            Banned
                          </span>
                        )}
                        {u.bypass_moderation && (
                          <span className="shrink-0 rounded-full border border-emerald-500/50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                            Videos
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
                    <span className="shrink-0 text-[#3f3f46]">{open ? "︿" : "﹀"}</span>
                  </button>

                  {open && (
                    <div className="space-y-2 border-t border-[#1a1a1d] bg-[#0a0a0c] px-4 py-3">
                      <Link
                        href={`/profile/${encodeURIComponent(u.username)}`}
                        className="block rounded-lg border border-[#27272a] px-3 py-2 text-center text-xs font-semibold text-zinc-200"
                      >
                        View profile
                      </Link>

                      <div className="grid grid-cols-2 gap-2">
                        {banned ? (
                          <button
                            onClick={() => runAction(u, "unban")}
                            disabled={!!busyAction}
                            className={`${btn} col-span-2 border-emerald-500/50 text-emerald-300`}
                          >
                            {busy("unban") ? "…" : "Unban"}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => runAction(u, "kick", `Kick @${u.username}? They'll be locked out for 24 hours.`)}
                              disabled={!!busyAction}
                              className={`${btn} border-amber-500/50 text-amber-300`}
                            >
                              {busy("kick") ? "…" : "Kick (24h)"}
                            </button>
                            <button
                              onClick={() => runAction(u, "ban", `Ban @${u.username} from lifeform until you unban them?`)}
                              disabled={!!busyAction}
                              className={`${btn} border-red-500/50 text-red-300`}
                            >
                              {busy("ban") ? "…" : "Ban"}
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => runAction(u, u.bypass_moderation ? "revoke_bypass" : "grant_bypass")}
                          disabled={!!busyAction}
                          className={`${btn} col-span-2 border-emerald-500/40 text-emerald-300`}
                        >
                          {busy("grant_bypass") || busy("revoke_bypass")
                            ? "…"
                            : u.bypass_moderation
                              ? "Take away videos + no AI filter"
                              : "Allow videos + skip AI filter"}
                        </button>
                        <button
                          onClick={() => runAction(u, "reset_username", `Replace @${u.username}'s username with a placeholder?`)}
                          disabled={!!busyAction}
                          className={`${btn} border-[#27272a] text-zinc-200`}
                        >
                          {busy("reset_username") ? "…" : "Reset username"}
                        </button>
                        <button
                          onClick={() => runAction(u, "clear_avatar", `Remove @${u.username}'s profile photo?`)}
                          disabled={!!busyAction}
                          className={`${btn} border-[#27272a] text-zinc-200`}
                        >
                          {busy("clear_avatar") ? "…" : "Remove photo"}
                        </button>
                        <button
                          onClick={() => runAction(u, "clear_bio", `Remove @${u.username}'s bio?`)}
                          disabled={!!busyAction}
                          className={`${btn} border-[#27272a] text-zinc-200`}
                        >
                          {busy("clear_bio") ? "…" : "Remove bio"}
                        </button>
                        <button
                          onClick={() =>
                            runAction(u, "purge_content", `Delete EVERY community post and reply by @${u.username}? This can't be undone.`)
                          }
                          disabled={!!busyAction}
                          className={`${btn} border-red-500/40 text-red-300`}
                        >
                          {busy("purge_content") ? "…" : "Delete all posts"}
                        </button>
                        <button
                          onClick={() =>
                            runAction(
                              u,
                              "delete_account",
                              `PERMANENTLY delete @${u.username}'s account and all their data? This can't be undone.`
                            )
                          }
                          disabled={!!busyAction}
                          className={`${btn} col-span-2 border-red-600 bg-red-600/15 text-red-300`}
                        >
                          {busy("delete_account") ? "…" : "Delete account permanently"}
                        </button>
                      </div>
                      {actionMsg && <p className="text-center text-xs text-zinc-400">{actionMsg}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
