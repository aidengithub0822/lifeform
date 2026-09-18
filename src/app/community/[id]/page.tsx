"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthorLine from "@/components/AuthorLine";
import Avatar from "@/components/Avatar";
import PullToRefresh from "@/components/PullToRefresh";
import MentionTextarea from "@/components/MentionTextarea";
import MentionText from "@/components/MentionText";
import { ChevronIcon, HeartIcon, ShareIcon } from "@/components/icons";
import type { AuthorInfo, CommunityComment, CommunityPost } from "@/lib/types";

interface ThreadProps {
  postId: string;
  comment: CommunityComment;
  depth: number;
  allComments: CommunityComment[];
  authors: Record<string, AuthorInfo>;
  myUserId: string | null;
  isAdmin: boolean;
  onPosted: () => void;
  deleteOwnComment: (id: string) => void;
  deleteAsAdminComment: (id: string) => void;
}

// Fully self-contained per node — its own reply-box open/draft/posting/error
// state, rather than one shared draft threaded through every node in the
// tree. That sharing was the source of the reply box carrying stale text
// (or the wrong error) when you switched which comment you were replying
// to; a self-contained node can't leak state between siblings.
function CommentNode({
  postId,
  comment,
  depth,
  allComments,
  authors,
  myUserId,
  isAdmin,
  onPosted,
  deleteOwnComment,
  deleteAsAdminComment,
}: ThreadProps) {
  const [replying, setReplying] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const children = allComments.filter((c) => c.parent_id === comment.id);
  const canDelete = isAdmin || comment.user_id === myUserId;
  const a = authors[comment.user_id];
  const indent = Math.min(depth, 4) * 16;

  async function submitReply() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/community/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: comment.id }),
      });
      const resBody = await res.json();
      if (!res.ok) {
        setError(resBody.error || "Couldn't post that reply");
        return;
      }
      setDraft("");
      setReplying(false);
      onPosted();
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div style={{ marginLeft: indent }} className={depth > 0 ? "border-l border-zinc-900 pl-3" : undefined}>
      <div className="py-2.5">
        <AuthorLine
          username={comment.author_username}
          avatarUrl={a?.avatar_url}
          color={a?.name_color}
          verified={a?.verified}
          rank={a?.rank}
          createdAt={comment.created_at}
        />
        <MentionText text={comment.body} className="mt-1.5 text-sm leading-relaxed text-zinc-200" />
        <div className="mt-1.5 flex items-center gap-3">
          <button
            onClick={() => {
              setReplying((v) => !v);
              setError(null);
            }}
            className="text-xs font-semibold text-zinc-500 active:opacity-60"
          >
            Reply
          </button>
          {canDelete && (
            <button
              onClick={() => (isAdmin && comment.user_id !== myUserId ? deleteAsAdminComment(comment.id) : deleteOwnComment(comment.id))}
              className="text-xs font-medium text-zinc-600 active:opacity-60"
            >
              Delete
            </button>
          )}
        </div>

        {replying && (
          <div className="mt-2 space-y-1.5">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              placeholder={comment.author_username ? `Reply to @${comment.author_username}...` : "Write a reply..."}
              rows={2}
              autoFocus
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
            />
            <div className="flex items-center justify-end gap-2">
              {error && <p className="mr-auto text-xs text-red-400">{error}</p>}
              <button onClick={() => setReplying(false)} className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500">
                Cancel
              </button>
              <button
                onClick={submitReply}
                disabled={posting || !draft.trim()}
                className="rounded-full bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-950 disabled:opacity-40"
              >
                {posting ? "Posting…" : "Reply"}
              </button>
            </div>
          </div>
        )}
      </div>

      {children.length > 0 && (
        <div>
          {children.map((child) => (
            <CommentNode
              key={child.id}
              postId={postId}
              comment={child}
              depth={depth + 1}
              allComments={allComments}
              authors={authors}
              myUserId={myUserId}
              isAdmin={isAdmin}
              onPosted={onPosted}
              deleteOwnComment={deleteOwnComment}
              deleteAsAdminComment={deleteAsAdminComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommunityThreadPage() {
  const params = useParams<{ id: string }>();
  const postId = params.id;
  const supabase = createClient();

  const [post, setPost] = useState<CommunityPost | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorInfo>>({});
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [postRes, commentsRes, { count: likes }, myLikeRes] = await Promise.all([
      supabase.from("community_posts").select("*").eq("id", postId).maybeSingle(),
      fetch(`/api/community/${postId}/comments`).then((r) => r.json()),
      supabase.from("community_post_likes").select("id", { count: "exact", head: true }).eq("post_id", postId),
      user
        ? supabase.from("community_post_likes").select("id").eq("post_id", postId).eq("user_id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const p = postRes.data as CommunityPost | null;
    if (!p) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setPost(p);
    setLikeCount(likes ?? 0);
    setLikedByMe(!!myLikeRes.data);
    const items: CommunityComment[] = commentsRes.items ?? [];
    setComments(items);

    const ids = [...new Set([p.user_id, ...items.map((c) => c.user_id)])];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, avatar_url, name_color, verified, rank")
        .in("user_id", ids)
        .returns<{ user_id: string; avatar_url: string | null; name_color: string | null; verified: boolean; rank: string }[]>();
      const authorMap: Record<string, AuthorInfo> = {};
      for (const pr of profiles ?? [])
        authorMap[pr.user_id] = { avatar_url: pr.avatar_url, name_color: pr.name_color, verified: pr.verified, rank: pr.rank };
      setAuthors(authorMap);
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

  async function toggleLike() {
    if (!myUserId || likeBusy || !post) return;
    setLikeBusy(true);
    if (likedByMe) {
      await supabase.from("community_post_likes").delete().eq("post_id", post.id).eq("user_id", myUserId);
    } else {
      await supabase.from("community_post_likes").insert({ post_id: post.id, user_id: myUserId });
    }
    setLikedByMe(!likedByMe);
    setLikeCount((c) => c + (likedByMe ? -1 : 1));
    setLikeBusy(false);
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
        <p className="text-sm text-zinc-600">Loading…</p>
      </div>
    );
  }

  if (notFound || !post) {
    return (
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/community" className="flex items-center gap-1 text-sm font-medium text-zinc-400">
          <ChevronIcon className="h-4 w-4" direction="left" /> Community
        </Link>
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
          This post isn&apos;t here anymore.
        </p>
      </div>
    );
  }

  const canDeletePost = isAdmin || post.user_id === myUserId;
  const topLevel = comments.filter((c) => !c.parent_id);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/community" className="flex items-center gap-1 text-sm font-medium text-zinc-400">
          <ChevronIcon className="h-4 w-4" direction="left" /> Community
        </Link>

        <div className="mt-4 border-b border-zinc-900 pb-4">
          <AuthorLine
            username={post.author_username}
            avatarUrl={authors[post.user_id]?.avatar_url}
            color={authors[post.user_id]?.name_color}
            verified={authors[post.user_id]?.verified}
            rank={authors[post.user_id]?.rank}
            createdAt={post.created_at}
          />
          {post.message && <MentionText text={post.message} className="mt-2.5 text-[15px] leading-relaxed text-zinc-100" />}
          {post.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.photo_url} alt="" className="mt-2.5 max-h-[28rem] w-full rounded-2xl object-cover" />
          )}
          <div className="mt-3 flex items-center gap-4">
            <button
              onClick={toggleLike}
              disabled={!myUserId || likeBusy}
              className={`flex items-center gap-1.5 active:opacity-60 ${likedByMe ? "text-red-400" : "text-zinc-500"}`}
            >
              <HeartIcon className="h-[18px] w-[18px]" filled={likedByMe} />
              {likeCount > 0 && <span className="text-xs font-medium">{likeCount}</span>}
            </button>
            <button onClick={share} className="text-zinc-500 active:opacity-60">
              <ShareIcon className="h-[18px] w-[18px]" />
            </button>
            {canDeletePost && (
              <button onClick={deletePost} className="ml-auto text-xs font-medium text-zinc-600 active:opacity-60">
                Delete post
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 flex gap-2.5">
          <Avatar url={myAvatar} name="me" size={32} />
          <div className="min-w-0 flex-1 space-y-2">
            <MentionTextarea
              value={reply}
              onChange={setReply}
              placeholder="Write a reply, tag someone with @..."
              rows={2}
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
            />
            <div className="flex items-center justify-end gap-2">
              {replyError && <p className="mr-auto text-xs text-red-400">{replyError}</p>}
              <button
                onClick={submitReply}
                disabled={posting || !reply.trim()}
                className="rounded-full bg-zinc-50 px-4 py-1.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
              >
                {posting ? "Posting…" : "Reply"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            {comments.length > 0 ? `${comments.length} ${comments.length === 1 ? "reply" : "replies"}` : "No replies yet"}
          </p>
          <div className="mt-1 divide-y divide-zinc-900">
            {topLevel.map((c) => (
              <CommentNode
                key={c.id}
                postId={postId}
                comment={c}
                depth={0}
                allComments={comments}
                authors={authors}
                myUserId={myUserId}
                isAdmin={isAdmin}
                onPosted={load}
                deleteOwnComment={deleteOwnComment}
                deleteAsAdminComment={deleteAsAdminComment}
              />
            ))}
          </div>
        </div>
      </div>
    </PullToRefresh>
  );
}
