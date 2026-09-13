"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthorLine from "@/components/AuthorLine";
import Avatar from "@/components/Avatar";
import PullToRefresh from "@/components/PullToRefresh";
import type { CommunityComment, CommunityPost } from "@/lib/types";

export default function CommunityThreadPage() {
  const params = useParams<{ id: string }>();
  const postId = params.id;
  const supabase = createClient();

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [postRes, commentsRes] = await Promise.all([
      supabase.from("community_posts").select("*").eq("id", postId).maybeSingle(),
      fetch(`/api/community/${postId}/comments`).then((r) => r.json()),
    ]);
    const p = postRes.data as CommunityPost | null;
    if (!p) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setPost(p);
    const items: CommunityComment[] = commentsRes.items ?? [];
    setComments(items);

    const ids = [...new Set([p.user_id, ...items.map((c) => c.user_id)])];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, avatar_url")
        .in("user_id", ids)
        .returns<{ user_id: string; avatar_url: string | null }[]>();
      const avatarMap: Record<string, string | null> = {};
      for (const pr of profiles ?? []) avatarMap[pr.user_id] = pr.avatar_url;
      setAvatars(avatarMap);
    }
    setLoading(false);
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
  }, [postId]);

  async function submitReply() {
    const body = reply.trim();
    if (!body) return;
    setPosting(true);
    setReplyError(null);
    try {
      const res = await fetch(`/api/community/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const resBody = await res.json();
      if (!res.ok) {
        setReplyError(resBody.error || "Couldn't post that reply");
        return;
      }
      setReply("");
      await load();
    } catch {
      setReplyError("Couldn't reach the server");
    } finally {
      setPosting(false);
    }
  }

  async function deleteOwnComment(id: string) {
    await supabase.from("community_comments").delete().eq("id", id);
    await load();
  }

  async function deleteAsAdminComment(id: string) {
    await fetch(`/api/admin/community-comments/${id}`, { method: "DELETE" });
    await load();
  }

  async function deletePost() {
    if (!post) return;
    if (isAdmin && post.user_id !== myUserId) {
      await fetch(`/api/admin/community/${post.id}`, { method: "DELETE" });
    } else {
      await supabase.from("community_posts").delete().eq("id", post.id);
    }
    window.history.back();
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url, title: "lifeform community post" });
      } catch {
        // cancelled
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

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-5 py-8">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/community" className="text-sm font-medium text-emerald-400">
          ← Back to Community
        </Link>
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
          This post isn&apos;t here anymore.
        </p>
      </div>
    );
  }

  const canDeletePost = isAdmin || post.user_id === myUserId;

  return (
    <PullToRefresh onRefresh={load}>
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/community" className="text-sm font-medium text-emerald-400">
          ← Back to Community
        </Link>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <AuthorLine
            username={post.author_username}
            avatarUrl={avatars[post.user_id]}
            createdAt={post.created_at}
          />
          <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{post.message}</p>
          <div className="mt-3 flex items-center gap-1 border-t border-zinc-800 pt-2.5">
            <button
              onClick={share}
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-400 active:bg-zinc-800"
            >
              <span>↗</span>
              <span>Share</span>
            </button>
            {canDeletePost && (
              <button
                onClick={deletePost}
                className="ml-auto rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 active:bg-zinc-800"
              >
                Delete post
              </button>
            )}
          </div>
        </div>

        <div className="lf-gradient-border mt-5 flex gap-2.5 p-3">
          <Avatar url={myAvatar} name="me" size={32} />
          <div className="min-w-0 flex-1 space-y-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply..."
              rows={2}
              className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <div className="flex items-center justify-end gap-2">
              {replyError && <p className="mr-auto text-xs text-red-400">{replyError}</p>}
              <button
                onClick={submitReply}
                disabled={posting || !reply.trim()}
                className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-60"
              >
                {posting ? "Posting..." : "Reply"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 space-y-2.5">
          <p className="text-sm font-semibold text-zinc-300">
            {comments.length > 0 ? `${comments.length} ${comments.length === 1 ? "reply" : "replies"}` : "No replies yet"}
          </p>
          {comments.map((c) => {
            const canDelete = isAdmin || c.user_id === myUserId;
            return (
              <div key={c.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5">
                <AuthorLine username={c.author_username} avatarUrl={avatars[c.user_id]} createdAt={c.created_at} />
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{c.body}</p>
                {canDelete && (
                  <button
                    onClick={() =>
                      isAdmin && c.user_id !== myUserId ? deleteAsAdminComment(c.id) : deleteOwnComment(c.id)
                    }
                    className="mt-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 active:bg-zinc-800"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </PullToRefresh>
  );
}
