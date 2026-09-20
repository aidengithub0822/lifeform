// Pin helpers shared by the feed and the post page. A post is "pinned now" if
// the developer pinned it AND (it's a permanent pin OR its timer hasn't run
// out) — expiry is computed from the timestamp, so nothing has to run at the
// moment a timed pin ends.

interface PinFields {
  pinned?: boolean | null;
  pinned_until?: string | null;
}

export function isPinnedNow(p: PinFields, nowMs: number): boolean {
  if (!p.pinned) return false;
  if (!p.pinned_until) return true;
  return Date.parse(p.pinned_until) > nowMs;
}

/** Timed pin still running — the author can't delete the post until it ends. */
export function isLockedNow(p: PinFields, nowMs: number): boolean {
  return !!p.pinned && !!p.pinned_until && Date.parse(p.pinned_until) > nowMs;
}

export function countdownLabel(untilIso: string, nowMs: number): string {
  const left = Math.max(0, Math.ceil((Date.parse(untilIso) - nowMs) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Feed order: pinned first (most recently pinned on top), then newest first. */
export function sortForFeed<T extends PinFields & { created_at: string; pinned_at?: string | null }>(
  posts: T[],
  nowMs: number
): T[] {
  return [...posts].sort((a, b) => {
    const pa = isPinnedNow(a, nowMs);
    const pb = isPinnedNow(b, nowMs);
    if (pa !== pb) return pa ? -1 : 1;
    if (pa && pb) return Date.parse(b.pinned_at ?? b.created_at) - Date.parse(a.pinned_at ?? a.created_at);
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}
