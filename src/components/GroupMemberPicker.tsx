"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";
import UserName from "@/components/UserName";

export interface PickedUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  name_color: string | null;
  verified: boolean;
  rank: string;
}

/**
 * Username search with multi-select checkboxes — used both for picking a
 * group's initial members on creation, and for adding someone to an
 * existing group later. `excludeIds` hides people already in the group (or
 * yourself) from the results so they can't be picked twice.
 */
export default function GroupMemberPicker({
  selected,
  onChange,
  excludeIds = [],
}: {
  selected: PickedUser[];
  onChange: (next: PickedUser[]) => void;
  excludeIds?: string[];
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedUser[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing results as the user erases the query
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
    }, 250);
    return () => clearTimeout(handle);
  }, [q]);

  function toggle(u: PickedUser) {
    if (selected.some((s) => s.user_id === u.user_id)) {
      onChange(selected.filter((s) => s.user_id !== u.user_id));
    } else {
      onChange([...selected, u]);
    }
  }

  const visibleResults = (results ?? []).filter((r) => !excludeIds.includes(r.user_id));

  return (
    <div>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((u) => (
            <button
              key={u.user_id}
              onClick={() => toggle(u)}
              className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-300"
            >
              {u.username} ✕
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by username..."
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      {loading && <p className="mt-2 text-xs text-zinc-500">Searching...</p>}
      {results !== null && !loading && (
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
          {visibleResults.length === 0 ? (
            <p className="py-2 text-xs text-zinc-500">No one found.</p>
          ) : (
            visibleResults.map((r) => {
              const picked = selected.some((s) => s.user_id === r.user_id);
              return (
                <button
                  key={r.user_id}
                  onClick={() => toggle(r)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-1.5 py-2 text-left active:bg-zinc-800 ${
                    picked ? "bg-zinc-800/60" : ""
                  }`}
                >
                  <Avatar url={r.avatar_url} name={r.username} size={32} />
                  <UserName username={r.username} color={r.name_color} verified={r.verified} rank={r.rank} className="text-sm font-medium" />
                  {picked && <span className="ml-auto text-emerald-400">✓</span>}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
