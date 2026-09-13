"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AuthorLine from "@/components/AuthorLine";
import type { AuthorInfo, PhotoComment, ProfilePhoto } from "@/lib/types";

/**
 * Full-screen overlay for a profile-gallery photo: like, comment, and
 * share, opened by tapping a photo in the grid on /profile/[username].
 * Takes the WHOLE gallery + a starting index so you can swipe/arrow
 * through every post fluidly instead of closing and reopening one at a
 * time.
 */
export default function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: ProfilePhoto[];
  initialIndex: number;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [authors, setAuthors] = useState<Record<string, AuthorInfo>>({});
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const touchStartX = useRef<number | null>(null);

  function goTo(next: number) {
    if (next < 0 || next >= photos.length) return;
    setIndex(next);
  }

  async function load(uid: string | null) {
    if (!photo) return;
    const [{ count }, { data: myLike }, { data: commentRows }] = await Promise.all([
      supabase.from("photo_likes").select("id", { count: "exact", head: true }).eq("photo_id", photo.id),
      uid
        ? supabase.from("photo_likes").select("id").eq("photo_id", photo.id).eq("user_id", uid).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("photo_comments")
        .select("*")
        .eq("photo_id", photo.id)
        .order("created_at", { ascending: true })
        .returns<PhotoComment[]>(),
    ]);
    const items = commentRows ?? [];
    setLikeCount(count ?? 0);
    setLikedByMe(!!myLike);
    setComments(items);

    const ids = [...new Set(items.map((c) => c.user_id))];
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, avatar_url, name_color, verified")
        .in("user_id", ids)
        .returns<{ user_id: string; avatar_url: string | null; name_color: string | null; verified: boolean }[]>();
      const map: Record<string, AuthorInfo> = {};
      for (const p of profiles ?? []) map[p.user_id] = { avatar_url: p.avatar_url, name_color: p.name_color, verified: p.verified };
      setAuthors(map);
    }
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? null);
      if (user) {
        const { data: prof } = await supabase.from("profiles").select("username").eq("user_id", user.id).maybeSingle();
        setMyUsername(prof?.username ?? null);
      }
      await load(user?.id ?? null);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id]);

  async function toggleLike() {
    if (!myUserId || busy || !photo) return;
    setBusy(true);
    if (likedByMe) {
      await supabase.from("photo_likes").delete().eq("photo_id", photo.id).eq("user_id", myUserId);
    } else {
      await supabase.from("photo_likes").insert({ photo_id: photo.id, user_id: myUserId });
    }
    await load(myUserId);
    setBusy(false);
  }

  async function submitComment() {
    const body = draft.trim();
    if (!body || !myUserId || !photo) return;
    setPosting(true);
    const { error } = await supabase
      .from("photo_comments")
      .insert({ photo_id: photo.id, user_id: myUserId, author_username: myUsername, body });
    if (!error && photo.user_id !== myUserId) {
      fetch("/api/push/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId: photo.user_id,
          title: "New comment",
          body: myUsername ? `${myUsername} commented: ${body}` : `New comment: ${body}`,
        }),
      }).catch(() => {});
    }
    setDraft("");
    await load(myUserId);
    setPosting(false);
  }

  async function deleteComment(id: string) {
    await supabase.from("photo_comments").delete().eq("id", id);
    await load(myUserId);
  }

  async function share() {
    if (!photo) return;
    if (navigator.share) {
      try {
        await navigator.share({ url: photo.photo_url });
      } catch {
        // cancelled
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(photo.photo_url);
      window.alert("Link copied");
    } catch {
      window.prompt("Copy this link:", photo.photo_url);
    }
  }

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" onClick={onClose}>
      <div className="flex items-center justify-between p-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-xs font-medium text-zinc-500">
          {index + 1} / {photos.length}
        </span>
        <button onClick={onClose} className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300">
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div
          className="relative"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (dx > 50) goTo(index - 1);
            else if (dx < -50) goTo(index + 1);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.photo_url} alt="" className="max-h-[55vh] w-full object-contain" />
          {index > 0 && (
            <button
              onClick={() => goTo(index - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-1.5 text-lg text-white"
              aria-label="Previous photo"
            >
              ‹
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              onClick={() => goTo(index + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-1.5 text-lg text-white"
              aria-label="Next photo"
            >
              ›
            </button>
          )}
        </div>

        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center gap-4 border-b border-zinc-800 pb-3">
            <button
              onClick={toggleLike}
              disabled={!myUserId || busy}
              className={`flex items-center gap-1.5 text-sm font-semibold ${
                likedByMe ? "text-red-400" : "text-zinc-300"
              }`}
            >
              <span>{likedByMe ? "❤️" : "🤍"}</span>
              <span>{likeCount}</span>
            </button>
            <div className="flex items-center gap-1.5 text-sm font-medium text-zinc-400">
              <span>💬</span>
              <span>{comments.length}</span>
            </div>
            <button onClick={share} className="ml-auto text-sm font-medium text-zinc-400 active:opacity-70">
              ↗ Share
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
            <button
              onClick={submitComment}
              disabled={posting || !draft.trim() || !myUserId}
              className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {posting ? "Posting..." : "Comment"}
            </button>
          </div>

          <div className="mt-4 space-y-2.5 pb-6">
            {comments.length === 0 && <p className="text-sm text-zinc-500">No comments yet.</p>}
            {comments.map((c) => {
              const a = authors[c.user_id];
              return (
                <div key={c.id} className="rounded-xl bg-zinc-900 p-2.5">
                  <AuthorLine
                    username={c.author_username}
                    avatarUrl={a?.avatar_url}
                    color={a?.name_color}
                    verified={a?.verified}
                    createdAt={c.created_at}
                  />
                  <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-200">{c.body}</p>
                  {c.user_id === myUserId && (
                    <button
                      onClick={() => deleteComment(c.id)}
                      className="mt-1 text-xs font-medium text-zinc-500 active:opacity-70"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
