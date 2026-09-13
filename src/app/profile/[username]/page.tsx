"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/imageUpload";
import PhotoLightbox from "@/components/PhotoLightbox";
import PullToRefresh from "@/components/PullToRefresh";
import Avatar from "@/components/Avatar";
import type { Profile, ProfilePhoto } from "@/lib/types";

export default function ProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username);
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  const [bioDraft, setBioDraft] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<ProfilePhoto | null>(null);

  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  async function load() {
    setLoading(true);
    setNotFound(false);
    const [{ data: me }, profileRes] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("profiles").select("*").eq("username", username).maybeSingle(),
    ]);
    const p = profileRes.data as Profile | null;
    setMyUserId(me.user?.id ?? null);
    if (!p) {
      setNotFound(true);
      setProfile(null);
      setPhotos([]);
      setLoading(false);
      return;
    }
    setProfile(p);
    setBioDraft(p.bio ?? "");
    const [{ data: gallery }, followerRes, followingRes, followingMeRes] = await Promise.all([
      supabase
        .from("profile_photos")
        .select("*")
        .eq("user_id", p.user_id)
        .order("created_at", { ascending: false })
        .returns<ProfilePhoto[]>(),
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("following_id", p.user_id),
      supabase
        .from("follows")
        .select("id", { count: "exact", head: true })
        .eq("follower_id", p.user_id),
      me.user
        ? supabase
            .from("follows")
            .select("id")
            .eq("follower_id", me.user.id)
            .eq("following_id", p.user_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (me.user) {
      const myProfileRes = await supabase.from("profiles").select("username").eq("user_id", me.user.id).maybeSingle();
      setMyUsername((myProfileRes.data as { username: string } | null)?.username ?? null);
    }
    setPhotos(gallery ?? []);
    setFollowerCount(followerRes.count ?? 0);
    setFollowingCount(followingRes.count ?? 0);
    let following = !!followingMeRes.data;

    // Developer mode: skip the manual follow step entirely so testing other
    // accounts' profiles (messaging, gated features, etc.) doesn't require
    // clicking Follow every time — auto-follow on visit, silently.
    const adminRes = await fetch("/api/admin/status").then((r) => r.json()).catch(() => ({ isAdmin: false }));
    const adminNow = !!adminRes.isAdmin;
    setIsAdmin(adminNow);
    if (me.user && me.user.id !== p.user_id && !following && adminNow) {
      const { error: autoFollowError } = await supabase
        .from("follows")
        .insert({ follower_id: me.user.id, following_id: p.user_id });
      if (!autoFollowError) {
        following = true;
        setFollowerCount((c) => c + 1);
      }
    }
    setIsFollowing(following);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount / username change
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const isOwn = !!profile && !!myUserId && profile.user_id === myUserId;

  async function saveBio() {
    if (!profile) return;
    setSavingBio(true);
    setBioError(null);
    const { error } = await supabase
      .from("profiles")
      .update({ bio: bioDraft.trim() || null, updated_at: new Date().toISOString() })
      .eq("user_id", profile.user_id);
    setSavingBio(false);
    if (error) {
      setBioError(error.message);
      return;
    }
    await load();
  }

  async function uploadAvatar(file: File) {
    if (!profile) return;
    setUploadingAvatar(true);
    setGalleryError(null);
    try {
      const blob = await compressImageForUpload(file, 800, 0.85);
      const path = `${profile.user_id}/avatar.jpg`;
      const { error } = await supabase.storage.from("profile-media").upload(path, blob, {
        upsert: true,
        contentType: "image/jpeg",
      });
      if (error) {
        setGalleryError(error.message);
        return;
      }
      const url = supabase.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
      // Cache-bust so the new avatar shows immediately instead of a stale cached image at the same URL.
      const bustUrl = `${url}?t=${Date.now()}`;
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: bustUrl, updated_at: new Date().toISOString() })
        .eq("user_id", profile.user_id);
      if (updateError) setGalleryError(updateError.message);
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : "Couldn't process that image");
    } finally {
      setUploadingAvatar(false);
      await load();
    }
  }

  async function uploadGalleryPhoto(file: File) {
    if (!profile) return;
    setUploadingPhoto(true);
    setGalleryError(null);
    try {
      const blob = await compressImageForUpload(file, 1600, 0.85);
      const path = `${profile.user_id}/gallery/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("profile-media").upload(path, blob, {
        contentType: "image/jpeg",
      });
      if (error) {
        setGalleryError(error.message);
        return;
      }
      const url = supabase.storage.from("profile-media").getPublicUrl(path).data.publicUrl;
      const { error: insertError } = await supabase
        .from("profile_photos")
        .insert({ user_id: profile.user_id, photo_url: url });
      if (insertError) setGalleryError(insertError.message);
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : "Couldn't process that image");
    } finally {
      setUploadingPhoto(false);
      await load();
    }
  }

  async function deleteGalleryPhoto(id: string) {
    await supabase.from("profile_photos").delete().eq("id", id);
    await load();
  }

  async function toggleFollow() {
    if (!profile || !myUserId || followBusy) return;
    setFollowBusy(true);
    // Optimistic update so the button feels instant.
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowerCount((c) => c + (wasFollowing ? -1 : 1));
    try {
      if (wasFollowing) {
        await supabase
          .from("follows")
          .delete()
          .eq("follower_id", myUserId)
          .eq("following_id", profile.user_id);
      } else {
        const { error: followError } = await supabase
          .from("follows")
          .insert({ follower_id: myUserId, following_id: profile.user_id });
        if (!followError) {
          fetch("/api/push/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toUserId: profile.user_id,
              title: "New follower",
              body: myUsername ? `${myUsername} started following you` : "Someone started following you",
              url: myUsername ? `/profile/${myUsername}` : "/",
            }),
          }).catch(() => {});
        }
      }
    } finally {
      setFollowBusy(false);
      await load();
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-5 py-8">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="mx-auto max-w-md px-5 py-8">
        <Link href="/" className="text-sm font-medium text-emerald-400">
          ← Back
        </Link>
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
          No profile found for &quot;{username}&quot;.
        </p>
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={load}>
    <div className="mx-auto max-w-md px-5 py-8">
      <Link href="/" className="text-sm font-medium text-emerald-400">
        ← Back
      </Link>

      {/* Header: avatar + stats row, Instagram-style */}
      <div className="mt-4 flex items-center gap-5">
        <div className="relative shrink-0">
          <Avatar url={profile.avatar_url} name={profile.username} size={84} ring />
          {isOwn && (
            <label className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-zinc-950 bg-emerald-500 text-sm active:opacity-80">
              {uploadingAvatar ? (
                <span className="text-[9px] font-bold text-black">...</span>
              ) : (
                <span className="text-black">＋</span>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])}
              />
            </label>
          )}
        </div>

        <div className="flex flex-1 justify-around text-center">
          <div>
            <p className="text-lg font-bold leading-tight">{photos.length}</p>
            <p className="text-[11px] text-zinc-400">Posts</p>
          </div>
          <div>
            <p className="text-lg font-bold leading-tight">{followerCount}</p>
            <p className="text-[11px] text-zinc-400">Followers</p>
          </div>
          <div>
            <p className="text-lg font-bold leading-tight">{followingCount}</p>
            <p className="text-[11px] text-zinc-400">Following</p>
          </div>
        </div>
      </div>

      <h1 className="mt-3 truncate text-base font-bold">{profile.username}</h1>

      <div className="mt-1.5">
        {isOwn ? (
          <div className="space-y-2">
            <textarea
              value={bioDraft}
              onChange={(e) => setBioDraft(e.target.value)}
              placeholder="Tell people a bit about yourself..."
              rows={2}
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            {bioDraft !== (profile.bio ?? "") && (
              <button
                onClick={saveBio}
                disabled={savingBio}
                className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-black disabled:opacity-60"
              >
                {savingBio ? "Saving..." : "Save bio"}
              </button>
            )}
            {bioError && <p className="text-sm text-red-400">{bioError}</p>}
          </div>
        ) : (
          profile.bio && <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">{profile.bio}</p>
        )}
      </div>

      {!isOwn && (
        <div className="mt-4">
          {isAdmin && (
            <p className="mb-1 text-[11px] font-medium text-zinc-500">
              Developer mode: auto-followed for easier testing access.
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={toggleFollow}
              disabled={followBusy || !myUserId}
              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition disabled:opacity-60 ${
                isFollowing
                  ? "border border-zinc-700 bg-zinc-900 text-zinc-200"
                  : "bg-emerald-500 text-black active:scale-[0.98]"
              }`}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
            <button
              onClick={() => router.push(`/messages/${profile.user_id}`)}
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 py-2 text-sm font-semibold text-zinc-200 active:scale-[0.98]"
            >
              Message
            </button>
          </div>
        </div>
      )}

      {isOwn && (
        <div className="mt-4">
          <label className="block w-full cursor-pointer rounded-xl border border-zinc-700 bg-zinc-900 py-2 text-center text-sm font-semibold text-zinc-200 active:scale-[0.98]">
            {uploadingPhoto ? "Uploading..." : "+ Add photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadGalleryPhoto(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {/* Photo grid: edge-to-edge, tight gap, square tiles — Instagram grid feel */}
      <div className="mt-6 border-t border-zinc-800 pt-3">
        {galleryError && <p className="mb-2 text-sm text-red-400">{galleryError}</p>}
        {photos.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-zinc-800 py-10 text-center text-sm text-zinc-500">
            {isOwn ? "No photos yet — add your first one." : "No photos yet."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {photos.map((p) => (
              <div key={p.id} className="group relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.photo_url}
                  alt={`${profile.username}'s photo`}
                  onClick={() => setLightboxPhoto(p)}
                  className="aspect-square w-full object-cover active:opacity-80"
                />
                {isOwn && (
                  <button
                    onClick={() => deleteGalleryPhoto(p.id)}
                    className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    {lightboxPhoto && <PhotoLightbox photo={lightboxPhoto} onClose={() => setLightboxPhoto(null)} />}
    </PullToRefresh>
  );
}
