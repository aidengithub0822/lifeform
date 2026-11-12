"use client";

import { useEffect, useRef, useState } from "react";
import BottomSheet from "@/components/BottomSheet";
import type { GifResult } from "@/app/api/gifs/search/route";

// Search-and-insert GIF picker (GIPHY), used by both the post composer and
// reply composers in Community. Replaces the old "pick a .gif file from
// your library" flow — that depended on the OS file/photo picker handing
// back the raw GIF bytes, which iOS doesn't reliably do (reports of a
// flat-out upload failure picking a GIF that way). Selecting here just
// hands back GIPHY's own hosted URL — nothing to upload at all.
export default function GifPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!open) return;
    const id = ++requestId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/gifs/search?q=${encodeURIComponent(query)}`);
        const body = await res.json();
        if (id !== requestId.current) return; // a newer keystroke's request won
        if (!res.ok) {
          setError(body.error || "Couldn't load GIFs");
          setItems([]);
        } else {
          setItems(body.items ?? []);
        }
      } catch {
        if (id === requestId.current) setError("Couldn't reach the server");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [open, query]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting the search box for next time the sheet opens, not syncing from a render
    if (!open) setQuery("");
  }, [open]);

  return (
    <BottomSheet open={open} onClose={onClose} className="h-[75dvh]">
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs"
          className="mb-3 w-full shrink-0 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="py-6 text-center text-sm text-red-400">{error}</p>}
          {!error && !loading && items.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-500">No GIFs found — try another search.</p>
          )}
          <div className="grid grid-cols-2 gap-2 pb-2">
            {items.map((gif) => (
              <button
                key={gif.id}
                onClick={() => {
                  onSelect(gif.url);
                  onClose();
                }}
                className="overflow-hidden rounded-xl bg-zinc-900"
                style={{ aspectRatio: gif.width && gif.height ? `${gif.width} / ${gif.height}` : "1 / 1" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gif.previewUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
          {loading && <p className="pb-4 text-center text-xs text-zinc-600">Loading…</p>}
        </div>
        <p className="shrink-0 pt-2 text-center text-[11px] text-zinc-600">Powered by GIPHY</p>
      </div>
    </BottomSheet>
  );
}
