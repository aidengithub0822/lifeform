"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CloseIcon, CommentIcon, HeartIcon, ShareIcon } from "@/components/icons";
import DoubleTapLike from "@/components/DoubleTapLike";
import type { ProfilePhoto } from "@/lib/types";

/**
 * Full-screen overlay for a profile-gallery photo: like, comment, and
 * share, opened by tapping a photo in the grid on /profile/[username].
 * Takes the WHOLE gallery + a starting index so you can swipe/arrow
 * through every post fluidly instead of closing and reopening one at a
 * time. Every gallery photo is mirrored into the Community feed as its
 * own post (see schema.sql), so commenting happens there — one comment
 * thread per post, instead of a second separate one living in the
 * lightbox.
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
  const router = useRouter();
  const [index, setIndex] = useState(initialIndex);
  const photo = photos[index];

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const touchStartX = useRef<number | null>(null);

  function goTo(next: number) {
    if (next < 0 || next >= photos.length) return;
    setIndex(next);
  }

  async function load(uid: string | null) {
    if (!photo) return;
    const [{ count: likes }, { data: myLike }, commentsRes] = await Promise.all([
      supabase.from("photo_likes").select("id", { count: "exact", head: true }).eq("photo_id", photo.id),
      uid
        ? supabase.from("photo_likes").select("id").eq("photo_id", photo.id).eq("user_id", uid).maybeSingle()
        : Promise.resolve({ data: null }),
      photo.community_post_id
        ? supabase.from("community_comments").select("id", { count: "exact", head: true }).eq("post_id", photo.community_post_id)
        : Promise.resolve({ count: 0 }),
    ]);
    setLikeCount(likes ?? 0);
    setLikedByMe(!!myLike);
    setCommentCount(commentsRes.count ?? 0);
  }

  useEffect(() => {
    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setMyUserId(user?.id ?? null);
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

  // Double-tap only ever likes (like Instagram/TikTok) — it never unlikes.
  function likePhoto() {
    if (!likedByMe) toggleLike();
  }

  function openComments() {
    if (!photo?.community_post_id) return;
    onClose();
    router.push(`/community/${photo.community_post_id}`);
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
      <div
        className="flex items-center justify-between px-3 pb-3 pt-[max(env(safe-area-inset-top),20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs font-medium text-zinc-500">
          {index + 1} / {photos.length}
        </span>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-zinc-300" aria-label="Close">
          <CloseIcon className="h-4 w-4" />
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
          <DoubleTapLike disabled={!myUserId} onLike={likePhoto}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.photo_url} alt="" className="max-h-[55vh] w-full object-contain" />
          </DoubleTapLike>
          {index > 0 && (
            <button
              onClick={() => goTo(index - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white"
              aria-label="Previous photo"
            >
              <ChevronLeft />
            </button>
          )}
          {index < photos.length - 1 && (
            <button
              onClick={() => goTo(index + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-2 text-white"
              aria-label="Next photo"
            >
              <ChevronRight />
            </button>
          )}
        </div>

        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center gap-5 border-b border-zinc-900 pb-3">
            <button
              onClick={toggleLike}
              disabled={!myUserId || busy}
              className={`flex items-center gap-1.5 text-sm font-semibold ${likedByMe ? "text-red-400" : "text-zinc-400"}`}
            >
              <HeartIcon className="h-5 w-5" filled={likedByMe} />
              <span>{likeCount}</span>
            </button>
            <button onClick={openComments} className="flex items-center gap-1.5 text-sm font-medium text-zinc-400" disabled={!photo.community_post_id}>
              <CommentIcon className="h-5 w-5" />
              <span>{commentCount}</span>
            </button>
            <button onClick={share} className="ml-auto text-zinc-400 active:opacity-70">
              <ShareIcon className="h-5 w-5" />
            </button>
          </div>

          <button
            onClick={openComments}
            disabled={!photo.community_post_id}
            className="mt-3 w-full rounded-xl border border-zinc-800 py-2.5 text-sm font-medium text-zinc-300 active:bg-zinc-900"
          >
            {commentCount > 0 ? `View ${commentCount} ${commentCount === 1 ? "comment" : "comments"}` : "Be the first to comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChevronLeft() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5 8 12l7 7" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
