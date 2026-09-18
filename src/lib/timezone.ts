// Timezone-aware calendar-day helpers — the single source of truth for
// "what day is it" everywhere in the app.
//
// THE BUG THIS FIXES: a lot of code used to derive "today"/"which day did
// this happen on" by slicing a UTC ISO string
// (`new Date().toISOString().slice(0, 10)`) or calling
// `setUTCHours`/`setUTCDate`. That reports the UTC calendar day, which
// silently disagrees with the user's actual local day for several hours
// around midnight in every timezone west of UTC (which is most of the US) —
// e.g. at 7pm Thursday in US Central time, it's already 00:00 Friday in
// UTC, so "today" came back as Friday. That's what pushed food logs, weight
// entries, and the streak onto the wrong day and skewed the graph.
//
// Client components: call these with NO timeZone argument. Running in the
// browser, Intl already defaults to the device's real local timezone, which
// is exactly what "what day is it for me right now" needs — no lookup
// required.
// Server code (API routes, server components) runs in a UTC container
// regardless of where the user actually is, so it MUST pass the user's
// stored `profiles.timezone` (an IANA zone name, kept in sync automatically
// by TimezoneSync.tsx) — see src/lib/userTimezone.ts for the server-side
// fetch helper.

export const DEFAULT_TIMEZONE = "UTC";

function safeTimeZone(tz?: string | null): string | undefined {
  if (!tz) return undefined;
  try {
    // Throws for a garbage/unsupported IANA name — fall back rather than
    // crashing the request over a corrupt stored value.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return undefined;
  }
}

/** The YYYY-MM-DD calendar date `date` falls on in `timeZone` (device-local if omitted). */
export function localDateString(date: Date, timeZone?: string | null): string {
  // en-CA formats as YYYY-MM-DD, matching every date column/string in the app.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today's calendar date in `timeZone` (device-local if omitted) — the one true "what day is it" call. */
export function todayLocal(timeZone?: string | null): string {
  return localDateString(new Date(), timeZone);
}

function offsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUTC - instant.getTime()) / 60000;
}

/**
 * The [start, end) UTC instant range covering local midnight-to-midnight of
 * `dateStr` (defaults to today) in `timeZone` — use this instead of a
 * `setUTCHours(0,0,0,0)`-style range whenever filtering/bucketing rows by
 * "did this happen on the user's local day X".
 */
export function localDayRangeUTC(
  timeZone: string | null | undefined,
  dateStr?: string
): { start: string; end: string } {
  const tz = safeTimeZone(timeZone) ?? DEFAULT_TIMEZONE;
  const day = dateStr ?? todayLocal(tz);
  const guess = new Date(`${day}T00:00:00.000Z`);
  const offsetMin = offsetMinutesAt(guess, tz);
  const start = new Date(guess.getTime() - offsetMin * 60000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}
