import { cookies } from "next/headers";
import { getUserTimezone } from "./userTimezone";

// A cookie beats the DB column for one reason: the DB column only becomes
// correct after (a) `supabase/schema.sql` has actually been re-run to add
// profiles.timezone, and (b) TimezoneSync.tsx's client write has completed
// and been re-read — both async, both able to lag or silently no-op (e.g.
// the column not existing yet makes that write fail quietly). The cookie is
// written synchronously, client-side, from the same Intl call, the moment
// the page loads — no migration and no round trip required — so it's the
// one source that's guaranteed to reflect the device's real timezone as
// soon as TimezoneSync.tsx has ever run once. Every server-side "what day
// is it" call should prefer this over the raw DB lookup.
export const TIMEZONE_COOKIE = "lf_tz";

export async function getCookieTimezone(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(TIMEZONE_COOKIE)?.value || null;
  } catch {
    // Not every context this runs in has a request (background jobs, etc).
    return null;
  }
}

/**
 * The one function server code should call for "what timezone is this user
 * in": the cookie set by TimezoneSync.tsx if present (fresh, migration-
 * independent), else the profiles.timezone DB column (works for
 * non-browser callers like the Scriptable widget, which never sends the
 * cookie), else UTC.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveUserTimezone(supabase: any, userId: string): Promise<string> {
  const cookieTz = await getCookieTimezone();
  if (cookieTz) return cookieTz;
  return getUserTimezone(supabase, userId);
}
