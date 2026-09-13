"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/imageUpload";
import AuthorLine from "@/components/AuthorLine";
import Avatar from "@/components/Avatar";
import PullToRefresh from "@/components/PullToRefresh";
import type { AuthorInfo, CommunityPost } from "@/lib/types";

export default function CommunityPage() {
  const supabase = createClient();
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
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
          const [{ data: comments }, { data: profiles }] = await Promise.all([
            supabase
              .from("community_comments")
              .select("post_id")
              .in("post_id", items.map((p) => p.id))
              .returns<{ post_id: string }[]>(),
            supabase
              .from("profiles")
              .select("user_id, avatar_url, name_color, verified")
              .in("user_id", ids)
              .returns<{ user_id: string; avatar_url: string | null; name_color: string | null; verified: boolean }[]>(),
          ]);
          const counts: Record<string, number> = {};
          for (const c of comments ?? []) counts[c.post_id] = (counts[c.post_id] ?? 0) + 1;
          setCommentCounts(counts);
          const authorMap: Record<string, AuthorInfo> = {};
          for (const p of profiles ?? [])
            authorMap[p.user_id] = { avatar_url: p.avatar_url, name_color: p.name_color, verified: p.verified };
          setAuthors(authorMap);
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
            {photoPreview && (
              <div className="relative w-fit">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoPreview} alt="" className="h-24 w-24 rounded-xl object-cover" />
                <button
                  onClick={clearPhoto}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-black/80 px-1.5 py-0.5 text-[10px] font-bold text-white"
                >
                  ✕
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <label className="cursor-pointer rounded-full border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-400 active:bg-zinc-800">
                📷 Photo
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
                  className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-black disabled:opacity-60"
                >
                  {posting ? "Posting..." : "Post"}
                </button>
              </div>
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
                  avatarUrl={authors[post.user_id]?.avatar_url}
                  color={authors[post.user_id]?.name_color}
                  verified={authors[post.user_id]?.verified}
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
                    {post.message && (
                      <p className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-zinc-100">
                        {post.message}
                      </p>
                    )}
                    {post.photo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={post.photo_url}
                        alt=""
                        className="mt-2.5 max-h-96 w-full rounded-xl object-cover"
                      />
                    )}
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
