"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Avatar from "@/components/Avatar";
import UserName from "@/components/UserName";
import { CloseIcon } from "@/components/icons";

interface Row {
  user_id: string;
  username: string;
  avatar_url: string | null;
  name_color: string | null;
  verified: boolean;
  rank: string;
}

/** Full-screen list of a profile's followers or following, opened by
 * tapping the count on the profile header — keeps you in the app instead
 * of navigating to a whole new route for something this quick. */
export default function FollowListOverlay({
  userId,
  mode,
  onClose,
}: {
  userId: string;
  mode: "followers" | "following";
  onClose: () => void;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setError(null);
      const column = mode === "followers" ? "following_id" : "follower_id";
      const otherColumn = mode === "followers" ? "follower_id" : "following_id";
      const { data: links, error: linksError } = await supabase.from("follows").select(otherColumn).eq(column, userId);
      if (linksError) {
        setError(linksError.message);
        setRows([]);
        return;
      }
      const ids = [...new Set((links ?? []).map((l) => (l as Record<string, string>)[otherColumn]))];
      if (ids.length === 0) {
        setRows([]);
        return;
      }
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, username, avatar_url, name_color, verified, rank")
        .in("user_id", ids)
        .returns<Row[]>();
      if (profilesError) {
        // Don't let a failure here read as "nobody follows you" — that's a
        // very different (and misleading) message from "this query broke".
        setError(profilesError.message);
        setRows([]);
        return;
      }
      setRows(profiles ?? []);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-zinc-950" onClick={onClose}>
      <div
        className="flex items-center justify-between border-b border-zinc-800 px-4 pb-3.5 pt-[max(env(safe-area-inset-top),20px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-bold capitalize">{mode}</p>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-zinc-300" aria-label="Close">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {rows === null && !error && <p className="p-5 text-sm text-zinc-500">Loading...</p>}
        {error && <p className="p-8 text-center text-sm text-red-400">Couldn&apos;t load this list: {error}</p>}
        {!error && rows?.length === 0 && (
          <p className="p-8 text-center text-sm text-zinc-500">
            {mode === "followers" ? "No followers yet." : "Not following anyone yet."}
          </p>
        )}
        {rows?.map((r) => (
          <Link
            key={r.user_id}
            href={`/profile/${encodeURIComponent(r.username)}`}
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-2.5 active:bg-zinc-900"
          >
            <Avatar url={r.avatar_url} name={r.username} size={40} />
            <UserName username={r.username} color={r.name_color} verified={r.verified} rank={r.rank} className="text-sm font-semibold" />
          </Link>
        ))}
      </div>
    </div>
  );
}
