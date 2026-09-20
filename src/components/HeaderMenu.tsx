"use client";

import { useState } from "react";
import { announceDevMode } from "@/lib/devSeen";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import UserLink from "@/components/UserLink";
import PushOptIn from "@/components/PushOptIn";
import { GearIcon } from "@/components/icons";
import type { Feedback, Goal } from "@/lib/types";

type Tab = "settings" | "info" | "feedback";

export default function HeaderMenu({ goal }: { goal: Goal }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("settings");
  const [signingOut, setSigningOut] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [comments, setComments] = useState<Feedback[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const [username, setUsername] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [devError, setDevError] = useState<string | null>(null);
  const [devBusy, setDevBusy] = useState(false);

  async function loadComments() {
    setLoadingComments(true);
    setFeedbackError(null);
    try {
      const res = await fetch("/api/feedback");
      const body = await res.json();
      if (!res.ok) {
        setFeedbackError(body.error || "Couldn't load comments");
        return;
      }
      setComments(body.items);
    } catch {
      setFeedbackError("Couldn't reach the server");
    } finally {
      setLoadingComments(false);
    }
  }

  async function initOnce() {
    if (initialized) return;
    setInitialized(true);

    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;
    setMyUserId(uid);

    if (uid) {
      const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", uid).maybeSingle();
      if (profile?.username) {
        setUsername(profile.username);
        setUsernameInput(profile.username);
      }
    }

    try {
      const res = await fetch("/api/admin/status");
      const body = await res.json();
      setIsAdmin(!!body.isAdmin);
    } catch {
      // Not critical — dev mode just won't show as unlocked.
    }
  }

  function selectTab(next: Tab) {
    setTab(next);
    if (next === "feedback" && comments === null) loadComments();
  }

  function openMenu() {
    setOpen(true);
    setTab("settings");
    initOnce();
  }

  async function saveUsername() {
    const next = usernameInput.trim();
    if (!next || next === username) return;
    setSavingUsername(true);
    setUsernameError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUsernameError("Not signed in");
      setSavingUsername(false);
      return;
    }
    const { error } = await supabase.from("profiles").upsert({ user_id: user.id, username: next });
    setSavingUsername(false);
    if (error) {
      setUsernameError(
        error.message.includes("duplicate") || error.message.includes("unique")
          ? "That username is already taken"
          : error.message
      );
      return;
    }
    setUsername(next);
  }

  async function verifyDevCode() {
    setDevBusy(true);
    setDevError(null);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: devCode }),
      });
      const body = await res.json();
      if (!res.ok) {
        setDevError(body.error || "Incorrect code");
        return;
      }
      setIsAdmin(true);
      announceDevMode(true);
      setDevCode("");
    } catch {
      setDevError("Couldn't reach the server");
    } finally {
      setDevBusy(false);
    }
  }

  async function exitDevMode() {
    await fetch("/api/admin/verify", { method: "DELETE" });
    setIsAdmin(false);
    announceDevMode(false);
  }

  async function submitComment() {
    const message = draft.trim();
    if (!message) return;
    setPosting(true);
    setFeedbackError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFeedbackError(body.error || "Couldn't post that comment");
        return;
      }
      setDraft("");
      await loadComments();
    } catch {
      setFeedbackError("Couldn't reach the server");
    } finally {
      setPosting(false);
    }
  }

  async function deleteOwnComment(id: string) {
    await supabase.from("feedback").delete().eq("id", id);
    await loadComments();
  }

  async function deleteAsAdmin(id: string) {
    await fetch(`/api/admin/comments/${id}`, { method: "DELETE" });
    await loadComments();
  }

  function startEditComment(c: Feedback) {
    setEditingId(c.id);
    setEditDraft(c.message);
  }

  async function saveEditComment(id: string) {
    const message = editDraft.trim();
    if (!message) return;
    await fetch(`/api/admin/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setEditingId(null);
    await loadComments();
  }

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Settings entry point — moved here from the "lifeform" wordmark
          (that's now a static, non-interactive logo centered up top; see
          HomePage) so tapping it doesn't feel like an accidental menu
          trigger anymore. */}
      <button
        onClick={openMenu}
        aria-label="Settings"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 active:scale-95"
      >
        <GearIcon className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={() => setOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85dvh] w-full flex-col rounded-t-3xl border-t border-zinc-800 bg-zinc-950 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-zinc-700" />

            <div className="mt-4 flex shrink-0 gap-1 px-4">
              {(
                [
                  ["settings", "Settings"],
                  ["info", "Help & info"],
                  ["feedback", "Comments"],
                ] as [Tab, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => selectTab(key)}
                  className={`flex-1 rounded-full py-2 text-xs font-semibold ${
                    tab === key ? "bg-emerald-500 text-black" : "bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5">
              {tab === "settings" && (
                <div className="space-y-4 pb-4">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                    <p className="text-sm font-semibold text-zinc-300">Username</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Shown on Comments and Community instead of your email.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder="Pick a username"
                        maxLength={24}
                        className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={saveUsername}
                        disabled={savingUsername || !usernameInput.trim() || usernameInput.trim() === username}
                        className="shrink-0 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
                      >
                        {savingUsername ? "Saving..." : "Save"}
                      </button>
                    </div>
                    {usernameError && <p className="mt-2 text-xs text-red-400">{usernameError}</p>}
                    {username && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => {
                            setOpen(false);
                            router.push(`/profile/${username}`);
                          }}
                          className="flex-1 rounded-xl bg-zinc-800 py-2 text-xs font-semibold text-zinc-200"
                        >
                          View my profile
                        </button>
                        <button
                          onClick={() => {
                            setOpen(false);
                            router.push("/messages");
                          }}
                          className="flex-1 rounded-xl bg-zinc-800 py-2 text-xs font-semibold text-zinc-200"
                        >
                          Messages
                        </button>
                      </div>
                    )}
                  </div>

                  <PushOptIn />

                  <a
                    href="/install"
                    className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-300">Add to home screen</p>
                      <p className="mt-0.5 text-xs text-zinc-500">Install lifeform on Android or iPhone</p>
                    </div>
                    <span className="text-zinc-500">›</span>
                  </a>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                    <p className="text-sm font-semibold text-zinc-300">Current goal</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <Stat label="Phase" value={goal.phase} capitalize />
                      <Stat label="Calories" value={`${goal.calorie_target}/day`} />
                      <Stat label="Protein" value={`${goal.protein_target_g}g`} />
                      <Stat label="Weekly rate" value={`${goal.weekly_rate_lb} lb/wk`} />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setOpen(false);
                      router.push("/onboarding");
                    }}
                    className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-zinc-200"
                  >
                    Edit goals
                  </button>

                  <button
                    onClick={signOut}
                    disabled={signingOut}
                    className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-red-400 disabled:opacity-60"
                  >
                    {signingOut ? "Signing out..." : "Sign out"}
                  </button>

                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                    <p className="text-sm font-semibold text-zinc-300">Developer</p>
                    {isAdmin ? (
                      <>
                        <p className="mt-1 text-xs text-emerald-400">Developer mode unlocked ✓</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          You can now delete or edit any comment/community post.
                        </p>
                        <button
                          onClick={exitDevMode}
                          className="mt-3 w-full rounded-xl bg-zinc-800 py-2 text-xs font-semibold text-zinc-300"
                        >
                          Exit developer mode
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-xs text-zinc-500">Enter the developer code to moderate content.</p>
                        <div className="mt-3 flex gap-2">
                          <input
                            type="password"
                            value={devCode}
                            onChange={(e) => setDevCode(e.target.value)}
                            placeholder="Developer code"
                            className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={verifyDevCode}
                            disabled={devBusy || !devCode}
                            className="shrink-0 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-semibold text-zinc-200 disabled:opacity-60"
                          >
                            {devBusy ? "..." : "Unlock"}
                          </button>
                        </div>
                        {devError && <p className="mt-2 text-xs text-red-400">{devError}</p>}
                      </>
                    )}
                  </div>
                </div>
              )}

              {tab === "info" && (
                <div className="space-y-4 pb-4 text-sm text-zinc-300">
                  <InfoCard title="Scoring">
                    Every scan is judged against your current goal phase — during a bulk, calorie-dense
                    and protein-adequate food scores well even if it isn&apos;t &quot;clean.&quot;
                    Cutting and maintaining favor higher-protein, lower-calorie-density choices instead.
                  </InfoCard>
                  <InfoCard title="Streak">
                    Your flame sparks the same day you log food OR a training session — no weekly quota
                    to hit first. Logging more in one day earns escalating XP too. Streak freezes (bought
                    with XP from the flame panel) auto-cover a missed day.
                  </InfoCard>
                  <InfoCard title="Home screen widget">
                    Open the flame in the top right of the Home tab for the Scriptable widget setup —
                    it shows your streak on the home screen without opening the app.
                  </InfoCard>
                  <InfoCard title="Comments & Community">
                    Comments is feedback for the app itself; Community is an open, AI-moderated thread
                    for general discussion. You can delete your own posts in either one.
                  </InfoCard>
                  <InfoCard title="Profiles & Messages">
                    Tap any username to see their profile — bio, photos, and a Message button. Your own
                    profile lets you set a bio, photo, and gallery images from the Settings tab above.
                  </InfoCard>
                  <p className="pt-1 text-center text-xs text-zinc-600">lifeform scanner</p>
                </div>
              )}

              {tab === "feedback" && (
                <div className="space-y-4 pb-4">
                  <div className="space-y-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Bug, idea, or just a comment..."
                      rows={3}
                      className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={submitComment}
                      disabled={posting || !draft.trim()}
                      className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
                    >
                      {posting ? "Posting..." : "Post comment"}
                    </button>
                  </div>

                  {feedbackError && <p className="text-sm text-red-400">{feedbackError}</p>}

                  <div className="space-y-3">
                    {loadingComments && <p className="text-sm text-zinc-500">Loading...</p>}
                    {!loadingComments && comments?.length === 0 && (
                      <p className="text-sm text-zinc-500">No comments yet — be the first.</p>
                    )}
                    {comments?.map((c) => {
                      const canDelete = isAdmin || c.user_id === myUserId;
                      const isEditing = editingId === c.id;
                      return (
                        <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-zinc-400">
                              <UserLink username={c.author_username} fallback={c.author_email || "Someone"} />
                            </span>
                            <p className="shrink-0 text-[11px] text-zinc-600">
                              {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                            </p>
                          </div>

                          {isEditing ? (
                            <div className="mt-2 space-y-2">
                              <textarea
                                value={editDraft}
                                onChange={(e) => setEditDraft(e.target.value)}
                                rows={3}
                                className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => saveEditComment(c.id)}
                                  className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-black"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingId(null)}
                                  className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{c.message}</p>
                          )}

                          {!isEditing && (canDelete || isAdmin) && (
                            <div className="mt-2 flex gap-3">
                              {canDelete && (
                                <button
                                  onClick={() =>
                                    isAdmin && c.user_id !== myUserId ? deleteAsAdmin(c.id) : deleteOwnComment(c.id)
                                  }
                                  className="text-xs font-medium text-zinc-500 active:opacity-70"
                                >
                                  Delete
                                </button>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={() => startEditComment(c)}
                                  className="text-xs font-medium text-zinc-500 active:opacity-70"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-xl bg-zinc-950 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`text-sm font-bold ${capitalize ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="mb-1.5 text-sm font-semibold text-zinc-200">{title}</p>
      <p className="text-xs leading-relaxed text-zinc-400">{children}</p>
    </div>
  );
}
