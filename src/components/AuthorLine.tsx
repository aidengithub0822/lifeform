"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import Avatar from "@/components/Avatar";

/** Avatar + username (linked to their profile) + relative timestamp — the
 * header row on a community post, reply, or photo comment. */
export default function AuthorLine({
  username,
  avatarUrl,
  createdAt,
  fallback = "Someone",
}: {
  username: string | null | undefined;
  avatarUrl?: string | null;
  createdAt: string;
  fallback?: string;
}) {
  const inner = (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar url={avatarUrl} name={username || fallback} size={28} />
      <span className="truncate text-sm font-semibold text-zinc-200">{username || fallback}</span>
    </div>
  );

  return (
    <div className="flex items-center justify-between gap-2">
      {username ? (
        <Link href={`/profile/${encodeURIComponent(username)}`} className="min-w-0">
          {inner}
        </Link>
      ) : (
        <div className="min-w-0">{inner}</div>
      )}
      <span className="shrink-0 text-[11px] text-zinc-600">
        {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
      </span>
    </div>
  );
}
