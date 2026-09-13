"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AuthorLine from "@/components/AuthorLine";
import Avatar from "@/components/Avatar";
import PullToRefresh from "@/components/PullToRefresh";
import type { AuthorInfo, CommunityComment, CommunityPost } from "@/lib/types";

interface ThreadProps {
  comment: CommunityComment;
  depth: number;
  allComments: CommunityComment[];
  authors: Record<string, AuthorInfo>;
  myUserId: string | null;
  isAdmin: boolean;
  openReplyFor: string | null;
  setOpenReplyFor: (id: string | null) => void;
  nestedDraft: string;
  setNestedDraft: (v: string) => void;
  nestedPosting: boolean;
  nestedError: string | null;
  submitNestedReply: (parentId: string) => void;
  deleteOwnComment: (id: string) => void;
  deleteAsAdminComment: (id: string) => void;
}

function CommentNode({
  comment,
  depth,
  allComments,
  authors,
  myUserId,
  isAdmin,
  openReplyFor,
  setOpenReplyFor,
  nestedDraft,
  setNestedDraft,
  nestedPosting,
  nestedError,
  submitNestedReply,
  deleteOwnComment,
  deleteAsAdminComment,
}: ThreadProps) {
  const children = allComments.filter((c) => c.parent_id === comment.id);
  const canDelete = isAdmin || comment.user_id === myUserId;
  const a = authors[comment.user_id];
  const indent = Math.min(depth, 3) * 14;

  return (
    <div style={{ marginLeft: indent }}>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5">
        <AuthorLine
          username={comment.author_username}
          avatarUrl={a?.avatar_url}
          color={a?.name_color}
          verified={a?.verified}
          rank={a?.rank}
          createdAt={comment.created_at}
        />
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{comment.body}</p>
        <div className="mt-1.5 flex items-center gap-1">
          <button
            onClick={() => setOpenReplyFor(openReplyFor === comment.id ? null : comment.id)}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 active:bg-zinc-800"
          >
            Reply
          </button>
          {canDelete && (
            <button
              onClick={() =>
                isAdmin && comment.user_id !== myUserId ? deleteAsAdminComment(comment.id) : deleteOwnComment(comment.id)
              }
              className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-500 active:bg-zinc-800"
            >
              Delete
            </button>
          )}
        </div>

        {openReplyFor === comment.id && (
          <div className="mt-2 space-y-1.5">
            <textarea
              value={nestedDraft}
              onChange={(e) => setNestedDraft(e.target.value)}
              placeholder="Write a reply..."
              rows={2}
              autoFocus
              className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm outline-none focus:border-emerald-500"
            />
            <div className="flex items-center justify-end gap-2">
              {nestedError && <p className="mr-auto text-xs text-red-400">{nestedError}</p>}
              <button
                onClick={() => setOpenReplyFor(null)}
                className="rounded-full px-2.5 py-1 text-xs font-medium text-zinc-400"
              >
                Cancel
              </button>
              <button
                onClick={() => submitNestedReply(comment.id)}
                disabled={nestedPosting || !nestedDraft.trim()}
                className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-black disabled:opacity-60"
              >
                {nestedPosting ? "Posting..." : "Reply"}
              </button>
            </div>
          </div>
        )}
      </div>

      {children.length > 0 && (
        <div className="mt-2 space-y-2 border-l border-zinc-800 pl-2.5">
          {children.map((child) => (
            <CommentNode
              key={child.id}
              comment={child}
              depth={depth + 1}
              allComments={allComments}
              authors={authors}
              myUserId={myUserId}
              isAdmin={isAdmin}
              openReplyFor={openReplyFor}
              setOpenReplyFor={setOpenReplyFor}
              nestedDraft={nestedDraft}
              setNestedDraft={setNestedDraft}
              nestedPosting={nestedPosting}
              nestedError={nestedError}
              submitNestedReply={submitNestedReply}
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

  const [reply, setReply] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const [openReplyFor, setOpenReplyFor] = useState<string | null>(null);
  const [nestedDraft, setNestedDraft] = useState("");
  const [nestedPosting, setNestedPosting] = useState(false);
  const [nestedError, setNestedError] = useState<string | null>(null);

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

  async function submitNestedReply(parentId: string) {
    const body = nestedDraft.trim();
    if (!body) return;
    setNestedPosting(true);
    setNestedError(null);
    try {
      const res = await fetch(`/api/community/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId }),
      });
      const resBody = await res.json();
      if (!res.ok) {
        setNestedError(resBody.error || "Couldn't post that reply");
        return;
      }
      setNestedDraft("");
      setOpenReplyFor(null);
      await load();
    } catch {
      setNestedError("Couldn't reach the server");
    } finally {
      setNestedPosting(false);
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
  const topLevel = comments.filter((c) => !c.parent_id);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/community" className="text-sm font-medium text-emerald-400">
          ← Back to Community
        </Link>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <AuthorLine
            username={post.author_username}
            avatarUrl={authors[post.user_id]?.avatar_url}
            color={authors[post.user_id]?.name_color}
            verified={authors[post.user_id]?.verified}
            rank={authors[post.user_id]?.rank}
            createdAt={post.created_at}
          />
          {post.message && (
            <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">{post.message}</p>
          )}
          {post.photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.photo_url} alt="" className="mt-2.5 max-h-[28rem] w-full rounded-xl object-cover" />
          )}
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
          {topLevel.map((c) => (
            <CommentNode
              key={c.id}
              comment={c}
              depth={0}
              allComments={comments}
              authors={authors}
              myUserId={myUserId}
              isAdmin={isAdmin}
              openReplyFor={openReplyFor}
              setOpenReplyFor={(id) => {
                setOpenReplyFor(id);
                setNestedDraft("");
                setNestedError(null);
              }}
              nestedDraft={nestedDraft}
              setNestedDraft={setNestedDraft}
              nestedPosting={nestedPosting}
              nestedError={nestedError}
              submitNestedReply={submitNestedReply}
              deleteOwnComment={deleteOwnComment}
              deleteAsAdminComment={deleteAsAdminComment}
            />
          ))}
        </div>
      </div>
    </PullToRefresh>
  );
}
