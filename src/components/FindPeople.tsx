"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import UserName from "@/components/UserName";

interface Row {
  user_id: string;
  username: string;
  avatar_url: string | null;
  name_color: string | null;
  verified: boolean;
  rank: string;
}

/** Username search box for Settings — usernames are unique, so this is a
 * reliable way to find someone by handle instead of hunting through posts. */
export default function FindPeople({ onNavigate }: { onNavigate?: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results as the user erases the query, not a render-cascade concern
      setResults(null);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/users/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((b) => setResults(b.items ?? []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250); // debounce so every keystroke doesn't fire a request
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-sm font-semibold text-zinc-300">Find people</p>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by username..."
        className="mt-3 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      {loading && <p className="mt-2 text-xs text-zinc-500">Searching...</p>}
      {results !== null && !loading && (
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {results.length === 0 ? (
            <p className="py-2 text-xs text-zinc-500">No one found.</p>
          ) : (
            results.map((r) => (
              <Link
                key={r.user_id}
                href={`/profile/${encodeURIComponent(r.username)}`}
                onClick={onNavigate}
                className="flex items-center gap-2.5 rounded-xl px-1.5 py-2 active:bg-zinc-800"
              >
                <Avatar url={r.avatar_url} name={r.username} size={32} />
                <UserName username={r.username} color={r.name_color} verified={r.verified} rank={r.rank} className="text-sm font-medium" />
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
