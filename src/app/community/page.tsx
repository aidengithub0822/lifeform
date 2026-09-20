"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/imageUpload";
import AuthorLine from "@/components/AuthorLine";
import Avatar from "@/components/Avatar";
import PullToRefresh from "@/components/PullToRefresh";
import MentionTextarea from "@/components/MentionTextarea";
import MentionText from "@/components/MentionText";
import DoubleTapLike from "@/components/DoubleTapLike";
import NotificationsBell from "@/components/NotificationsBell";
import { CameraIcon, CloseIcon, CommentIcon, HeartIcon, ShareIcon } from "@/components/icons";
import type { AuthorInfo, CommunityPost } from "@/lib/types";

export default function CommunityPage() {
  const supabase = createClient();
  const router = useRouter();
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Record<string, boolean>>({});
  const [likeBusy, setLikeBusy] = useState<Record<string, boolean>>({});
  const [authors, setAuthors] = useState<Record<string, AuthorInfo>>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          const postIds = items.map((p) => p.id);
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const [{ data: comments }, { data: profiles }, { data: likes }, { data: myLikeRows }] = await Promise.all([
            supabase
              .from("community_comments")
              .select("post_id")
              .in("post_id", postIds)
              .returns<{ post_id: string }[]>(),
            supabase
              .from("profiles")
              .select("user_id, avatar_url, name_color, verified, rank")
              .in("user_id", ids)
              .returns<{ user_id: string; avatar_url: string | null; name_color: string | null; verified: boolean; rank: string }[]>(),
            supabase
              .from("community_post_likes")
              .select("post_id")
              .in("post_id", postIds)
              .returns<{ post_id: string }[]>(),
            user
              ? supabase
                  .from("community_post_likes")
                  .select("post_id")
                  .in("post_id", postIds)
                  .eq("user_id", user.id)
                  .returns<{ post_id: string }[]>()
              : Promise.resolve({ data: [] as { post_id: string }[] }),
          ]);
          const counts: Record<string, number> = {};
          for (const c of comments ?? []) counts[c.post_id] = (counts[c.post_id] ?? 0) + 1;
          setCommentCounts(counts);
          const authorMap: Record<string, AuthorInfo> = {};
          for (const p of profiles ?? [])
            authorMap[p.user_id] = { avatar_url: p.avatar_url, name_color: p.name_color, verified: p.verified, rank: p.rank };
          setAuthors(authorMap);
          const lCounts: Record<string, number> = {};
          for (const l of likes ?? []) lCounts[l.post_id] = (lCounts[l.post_id] ?? 0) + 1;
          setLikeCounts(lCounts);
          const mine: Record<string, boolean> = {};
          for (const l of myLikeRows ?? []) mine[l.post_id] = true;
          setMyLikes(mine);
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

  function pickPhoto(file: File) {
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submitPost() {
    const message = draft.trim();
    if (!message && !photoFile) return;
    if (!myUserId) return;
    setPosting(true);
    setError(null);
    try {
      let photoUrl: string | null = null;
      if (photoFile) {
        const blob = await compressImageForUpload(photoFile, 1600, 0.85);
        const path = `${myUserId}/community/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from("profile-media").upload(path, blob, {
          contentType: "image/jpeg",
        });
        if (uploadError) {
          setError(uploadError.message);
          return;
        }
        photoUrl = supabase.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
      }

      const res = await fetch("/api/community", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, photoUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Couldn't post that");
        return;
      }
      setDraft("");
      clearPhoto();
      await load();
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setPosting(false);
    }
  }

  async function toggleLike(postId: string) {
    if (!myUserId || likeBusy[postId]) return;
    const currentlyLiked = !!myLikes[postId];
    setLikeBusy((b) => ({ ...b, [postId]: true }));
    // Optimistic update — the count/heart flips immediately, then gets
    // corrected if the request fails.
    setMyLikes((m) => ({ ...m, [postId]: !currentlyLiked }));
    setLikeCounts((c) => ({ ...c, [postId]: (c[postId] ?? 0) + (currentlyLiked ? -1 : 1) }));
    const { error: likeError } = currentlyLiked
      ? await supabase.from("community_post_likes").delete().eq("post_id", postId).eq("user_id", myUserId)
      : await supabase.from("community_post_likes").insert({ post_id: postId, user_id: myUserId });
    if (likeError) {
      // Revert on failure.
      setMyLikes((m) => ({ ...m, [postId]: currentlyLiked }));
      setLikeCounts((c) => ({ ...c, [postId]: (c[postId] ?? 0) + (currentlyLiked ? 1 : -1) }));
    }
    setLikeBusy((b) => ({ ...b, [postId]: false }));
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
    const target = posts?.find((p) => p.id === id);
    // Authors edit through the normal (moderated) route; developer mode can
    // edit anyone's post through the admin route.
    const viaAdmin = isAdmin && !!target && target.user_id !== myUserId;
    try {
      const res = await fetch(viaAdmin ? `/api/admin/community/${id}` : `/api/community/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error || "Couldn't save that edit");
        return;
      }
    } catch {
      setError("Couldn't reach the server");
      return;
    }
    setError(null);
    setEditingId(null);
    await load();
  }

  // Double-tap only ever likes (like Instagram/TikTok) — it never unlikes.
  function likePost(postId: string) {
    if (!myLikes[postId]) toggleLike(postId);
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Community</h1>
          <NotificationsBell />
        </div>
        <p className="mt-1 text-sm text-zinc-500">Everything the lifeform community is sharing, moderated so it stays worth reading.</p>

        <div className="mt-5 flex gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3.5">
          <Avatar url={myAvatar} name="me" size={38} />
          <div className="min-w-0 flex-1 space-y-2.5">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              placeholder="Share a win, ask a question, tag a creator with @..."
              rows={2}
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-[15px] leading-snug text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
            />
            {photoPreview && (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="" className="h-24 w-24 rounded-xl object-cover" />
                <button
                  onClick={clearPhoto}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950 text-zinc-300 ring-1 ring-zinc-700"
                  aria-label="Remove photo"
                >
                  <CloseIcon className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-zinc-500 active:bg-zinc-800">
                <CameraIcon className="h-4 w-4" />
                Photo
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
                />
              </label>
              <div className="flex items-center gap-2">
                {error && <p className="text-xs text-red-400">{error}</p>}
                <button
                  onClick={submitPost}
                  disabled={posting || (!draft.trim() && !photoFile)}
                  className="rounded-full bg-zinc-50 px-4 py-1.5 text-sm font-semibold text-zinc-950 disabled:opacity-40"
                >
                  {posting ? "Posting…" : "Post"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 divide-y divide-zinc-900">
          {loading && <p className="py-6 text-sm text-zinc-600">Loading…</p>}
          {!loading && posts?.length === 0 && (
            <p className="rounded-2xl border border-dashed border-zinc-800 py-10 text-center text-sm text-zinc-600">
              No posts yet — be the first.
            </p>
          )}
          {posts?.map((post) => {
            const canDelete = isAdmin || post.user_id === myUserId;
            const isEditing = editingId === post.id;
            const replies = commentCounts[post.id] ?? 0;
            return (
              <div key={post.id} className="py-4 first:pt-0">
                <AuthorLine
                  username={post.author_username}
                  avatarUrl={authors[post.user_id]?.avatar_url}
                  color={authors[post.user_id]?.name_color}
                  verified={authors[post.user_id]?.verified}
                  rank={authors[post.user_id]?.rank}
                  createdAt={post.created_at}
                />

                {isEditing ? (
                  <div className="mt-2.5 space-y-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-zinc-600"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => saveEdit(post.id)} className="rounded-lg bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-950">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-300">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <DoubleTapLike
                    disabled={!myUserId}
                    onLike={() => likePost(post.id)}
                    onSingleTap={() => router.push(`/community/${post.id}`)}
                    className="block"
                  >
                    {post.message && <MentionText text={post.message} className="mt-2 text-[15px] leading-relaxed text-zinc-100" />}
                    {post.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.photo_url} alt="" className="mt-2.5 max-h-96 w-full rounded-2xl object-cover" />
                    )}
                  </DoubleTapLike>
                )}

                {!isEditing && (
                  <div className="mt-2.5 flex items-center gap-4">
                    <button
                      onClick={() => toggleLike(post.id)}
                      disabled={!myUserId}
                      className={`flex items-center gap-1.5 active:opacity-60 ${myLikes[post.id] ? "text-red-400" : "text-zinc-500"}`}
                    >
                      <HeartIcon className="h-[18px] w-[18px]" filled={!!myLikes[post.id]} />
                      {(likeCounts[post.id] ?? 0) > 0 && <span className="text-xs font-medium">{likeCounts[post.id]}</span>}
                    </button>
                    <Link href={`/community/${post.id}`} className="flex items-center gap-1.5 text-zinc-500 active:opacity-60">
                      <CommentIcon className="h-[18px] w-[18px]" />
                      {replies > 0 && <span className="text-xs font-medium">{replies}</span>}
                    </Link>
                    <button onClick={() => sharePost(post)} className="flex items-center gap-1.5 text-zinc-500 active:opacity-60">
                      <ShareIcon className="h-[18px] w-[18px]" />
                    </button>
                    {canDelete && (
                      <button onClick={() => startEdit(post)} className="ml-auto text-xs font-medium text-zinc-600 active:opacity-60">
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => (isAdmin && post.user_id !== myUserId ? deleteAsAdmin(post.id) : deleteOwn(post.id))}
                        className="text-xs font-medium text-zinc-600 active:opacity-60"
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
