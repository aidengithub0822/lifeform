"use client";

import { useEffect, useRef, useState } from "react";

interface UserHit {
  user_id: string;
  username: string;
}

// A plain <textarea> that pops a username autocomplete list while typing
// "@something" — lets people tag other creators without leaving the
// composer. Selecting a suggestion splices "@username " in at the cursor.
export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<UserHit[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // query is only ever set to a string via handleChange/selectSuggestion,
    // which also clear `suggestions` themselves at the call site — so this
    // effect has nothing to synchronize when query is null and can just
    // skip, rather than calling setState synchronously on that branch.
    if (query === null) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (cancelled || !res.ok) return;
      const body = await res.json();
      setSuggestions((body.items ?? []).slice(0, 6));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  function mentionQueryAt(text: string, cursor: number): string | null {
    const uptoCursor = text.slice(0, cursor);
    const m = uptoCursor.match(/(?:^|\s)@([a-zA-Z0-9_]{0,32})$/);
    return m ? m[1] : null;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    const next = mentionQueryAt(v, e.target.selectionStart ?? v.length);
    setQuery(next);
    if (next === null) setSuggestions([]);
  }

  function selectSuggestion(username: string) {
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? value.length;
    const uptoCursor = value.slice(0, cursor);
    const replaced = uptoCursor.replace(/(?:^|\s)@([a-zA-Z0-9_]{0,32})$/, (whole) => {
      const lead = whole.startsWith(" ") || whole.startsWith("\n") ? whole[0] : "";
      return `${lead}@${username} `;
    });
    const newValue = replaced + value.slice(cursor);
    onChange(newValue);
    setQuery(null);
    setSuggestions([]);
    requestAnimationFrame(() => el?.focus());
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className={className}
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
          {suggestions.map((u) => (
            <button
              key={u.user_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(u.username);
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              <span className="text-zinc-500">@</span>
              {u.username}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
