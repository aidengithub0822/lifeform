"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import type { Feedback, Goal } from "@/lib/types";

type Tab = "settings" | "info" | "feedback";

export default function HeaderMenu({ goal }: { goal: Goal }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("settings");
  const [signingOut, setSigningOut] = useState(false);

  const [comments, setComments] = useState<Feedback[] | null>(null);
  const [loadingComments, setLoadingComments] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

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

  function selectTab(next: Tab) {
    setTab(next);
    if (next === "feedback" && comments === null) loadComments();
  }

  function openMenu() {
    setOpen(true);
    setTab("settings");
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

  async function signOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <button
        onClick={openMenu}
        className="text-xl font-bold lowercase tracking-tight active:opacity-70"
      >
        lifeform
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
                    Your flame grows on a day you log food <em>and</em> stay on pace for your weekly gym
                    target. Streak freezes (bought with XP from the flame panel) auto-cover a missed day.
                  </InfoCard>
                  <InfoCard title="Home screen widget">
                    Open the flame in the top right of the diary tab for the Scriptable widget setup —
                    it shows your streak on the home screen without opening the app.
                  </InfoCard>
                  <InfoCard title="Comments">
                    Use the Comments tab to leave feedback or bugs — anyone using this app can read and
                    post there.
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
                    {comments?.map((c) => (
                      <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-zinc-400">
                            {c.author_email || "Someone"}
                          </p>
                          <p className="shrink-0 text-[11px] text-zinc-600">
                            {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                          </p>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{c.message}</p>
                      </div>
                    ))}
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
