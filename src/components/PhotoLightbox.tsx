"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import UserLink from "@/components/UserLink";
import type { PhotoComment, ProfilePhoto } from "@/lib/types";

/**
 * Full-screen overlay for one profile-gallery photo: like, comment, and
 * share, opened by tapping a photo in the grid on /profile/[username].
 */
export default function PhotoLightbox({ photo, onClose }: { photo: ProfilePhoto; onClose: () => void }) {
  const supabase = createClient();
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);
  const [likeCount, setLikeCount] = useState(0);
  const [likedByMe, setLikedByMe] = useState(false);
  const [comments, setComments] = useState<PhotoComment[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load(uid: string | null) {
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
    setLikeCount(count ?? 0);
    setLikedByMe(!!myLike);
    setComments(commentRows ?? []);
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
  }, [photo.id]);

  async function toggleLike() {
    if (!myUserId || busy) return;
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
    if (!body || !myUserId) return;
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

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" onClick={onClose}>
      <div className="flex justify-end p-3" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-300">
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.photo_url} alt="" className="max-h-[55vh] w-full object-contain" />

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
            {comments.map((c) => (
              <div key={c.id} className="rounded-xl bg-zinc-900 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-zinc-400">
                    <UserLink username={c.author_username} fallback="Someone" />
                  </span>
                  <p className="shrink-0 text-[11px] text-zinc-600">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </p>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-200">{c.body}</p>
                {c.user_id === myUserId && (
                  <button
                    onClick={() => deleteComment(c.id)}
                    className="mt-1 text-xs font-medium text-zinc-500 active:opacity-70"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
