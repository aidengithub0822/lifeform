import Link from "next/link";
import FindPeople from "@/components/FindPeople";

// Social: one recognizable home for the feed, DMs, and finding people —
// previously Community lived in the bottom nav on its own, Messages was
// buried in a "More to explore" grid on Home, and searching for someone
// only existed inside the Settings sheet. Consolidating those here means
// "where's the social stuff" has exactly one answer.
export default function SocialPage() {
  return (
    <div className="mx-auto max-w-md px-5 pb-24 pt-8">
      <h1 className="text-2xl font-bold">Social</h1>
      <p className="mt-1 text-sm text-zinc-400">The community feed, your messages, and finding people.</p>

      <div className="mt-5 space-y-3">
        <Link
          href="/community"
          className="flex items-center gap-3.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl">
            🌐
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-100">Community feed</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">Posts, photos, and replies from everyone</p>
          </div>
          <span className="text-zinc-600">›</span>
        </Link>

        <Link
          href="/messages"
          className="flex items-center gap-3.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 active:scale-[0.99]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl">
            ✉️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-100">Messages</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500">Direct messages with other users</p>
          </div>
          <span className="text-zinc-600">›</span>
        </Link>
      </div>

      <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Find people
      </p>
      <FindPeople />
    </div>
  );
}
