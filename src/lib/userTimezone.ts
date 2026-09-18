import { DEFAULT_TIMEZONE } from "./timezone";

// Minimal shape both the authenticated Supabase client and the admin
// (service-role) client satisfy — same pattern as streakService.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

/**
 * Server-side "what timezone is this user in" lookup, used everywhere a
 * route needs to compute the user's LOCAL calendar day (see
 * src/lib/timezone.ts for why this matters). Falls back to UTC for an
 * account that hasn't synced a timezone yet (brand new, or signed in from a
 * client build that predates TimezoneSync.tsx) rather than failing — UTC is
 * wrong for most users, but it's a safe, consistent fallback until the
 * client checks in, at which point it self-corrects with no user action.
 */
export async function getUserTimezone(supabase: AnySupabase, userId: string): Promise<string> {
  const { data } = await supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle();
  return (data?.timezone as string | null) || DEFAULT_TIMEZONE;
}
