"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthorLine from "@/components/AuthorLine";
import Avatar from "@/components/Avatar";
import PullToRefresh from "@/components/PullToRefresh";
import type { CommunityPost } from "@/lib/types";

export default function CommunityPage() {
  const supabase = createClient();
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/community");
      const body = await res.json();
      if (res.ok) {
        const items: CommunityPost[] = body.items ?? [];
        setPosts(items);
        if (items.length > 0) {
          const ids = [...new Set(items.map((p) => p.user_id))];
          const [{ data: comments }, { data: profiles }] = await Promise.all([
            supabase
              .from("community_comments")
              .select("post_id")
              .in("post_id", items.map((p) => p.id))
              .returns<{ post_id: string }[]>(),
            supabase
              .from("profiles")
              .select("user_id, avatar_url")
              .in("user_id", ids)
              .returns<{ user_id: string; avatar_url: string | null }[]>(),
          ]);
          const counts: Record<string, number> = {};
          for (const c of comments ?? []) counts[c.post_id] = (counts[c.post_id] ?? 0) + 1;
          setCommentCounts(counts);
          const avatarMap: Record<string, string | null> = {};
          for (const p of profiles ?? []) avatarMap[p.user_id] = p.avatar_url;
          setAvatars(avatarMap);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    load();
    supabase.auth.getUser().then(({ data }) => {
      setMyUserId(data.user?.id ?? null);
      if (data.user) {
        supabase
          .from("profiles")
          .select("avatar_url")
          .eq("user_id", data.user.id)
          .maybeSingle()
          .then(({ data: prof }) => setMyAvatar((prof as { avatar_url: string | null } | null)?.avatar_url ?? null));
      }
    });
    fetch("/api/admin/status")
      .then((r) => r.json())
      .then((b) => setIsAdmin(!!b.isAdmin))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitPost() {
    const message = draft.trim();
    if (!message) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch("/api/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Couldn't post that");
        return;
      }
      setDraft("");
      await load();
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setPosting(false);
    }
  }

  async function deleteOwn(id: string) {
    await supabase.from("community_posts").delete().eq("id", id);
    await load();
  }

  async function deleteAsAdmin(id: string) {
    await fetch(`/api/admin/community/${id}`, { method: "DELETE" });
    await load();
  }

  function startEdit(post: CommunityPost) {
    setEditingId(post.id);
    setEditDraft(post.message);
  }

  async function saveEdit(id: string) {
    const message = editDraft.trim();
    if (!message) return;
    await fetch(`/api/admin/community/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    setEditingId(null);
    await load();
  }

  async function sharePost(post: CommunityPost) {
    const url = `${window.location.origin}/community/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: "lifeform community post" });
      } catch {
        // user cancelled the share sheet — nothing to do
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      window.alert("Link copied");
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <PullToRefresh onRefresh={load}>
      <div className="mx-auto max-w-md px-5 py-8">
        <div className="flex items-center gap-2">
          <h1 className="lf-glow rounded-full px-1 text-2xl font-bold">Community</h1>
        </div>
        <p className="mt-1.5 text-sm text-zinc-400">
          A shared feed for anyone using lifeform — AI-moderated, so it stays worth reading.
        </p>

        <div className="lf-gradient-border mt-5 flex gap-2.5 p-3">
          <Avatar url={myAvatar} name="me" size={36} />
          <div className="min-w-0 flex-1 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Share a win, ask a question, start a discussion..."
              rows={2}
              className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <div className="flex items-center justify-end gap-2">
              {error && <p className="mr-auto text-xs text-red-400">{error}</p>}
              <button
                onClick={submitPost}
                disabled={posting || !draft.trim()}
                className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-60"
              >
                {posting ? "Posting..." : "Post"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {loading && <p className="text-sm text-zinc-500">Loading...</p>}
          {!loading && posts?.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
              No posts yet — be the first.
            </p>
          )}
          {posts?.map((post) => {
            const canDelete = isAdmin || post.user_id === myUserId;
            const isEditing = editingId === post.id;
            const replies = commentCounts[post.id] ?? 0;
            return (
              <div
                key={post.id}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition active:scale-[0.99]"
              >
                <AuthorLine
                  username={post.author_username}
                  avatarUrl={avatars[post.user_id]}
                  createdAt={post.created_at}
                />

                {isEditing ? (
                  <div className="mt-2.5 space-y-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(post.id)}
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
                  <Link href={`/community/${post.id}`} className="block">
                    <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
                      {post.message}
                    </p>
                  </Link>
                )}

                {!isEditing && (
                  <div className="mt-3 flex items-center gap-1 border-t border-zinc-800 pt-2.5">
                    <Link
                      href={`/community/${post.id}`}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-400 active:bg-zinc-800"
                    >
                      <span>💬</span>
                      <span>{replies > 0 ? replies : "Reply"}</span>
                    </Link>
                    <button
                      onClick={() => sharePost(post)}
                      className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-400 active:bg-zinc-800"
                    >
                      <span>↗</span>
                      <span>Share</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => startEdit(post)}
                        className="ml-auto rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 active:bg-zinc-800"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() =>
                          isAdmin && post.user_id !== myUserId ? deleteAsAdmin(post.id) : deleteOwn(post.id)
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 active:bg-zinc-800 ${
                          isAdmin ? "" : "ml-auto"
                        }`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PullToRefresh>
  );
}
