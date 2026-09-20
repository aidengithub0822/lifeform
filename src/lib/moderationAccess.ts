import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";
import { RESERVED_DEV_COLOR } from "@/lib/nameColor";

/**
 * Who may skip the AI post filter and post videos in the community: the
 * developer (an unlocked developer-mode session, or the account wearing the
 * reserved dev name color) and any account the developer has explicitly
 * granted `profiles.bypass_moderation`. Server-only.
 *
 * Tolerates the column not existing yet (SQL not run): falls back to just the
 * dev checks rather than throwing.
 */
/** The developer: an unlocked developer-mode session, or the account wearing the reserved dev name color. */
export async function isDeveloper(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  if (verifyAdminToken(cookieStore.get(adminCookieName())?.value)) return true;
  const { data } = await supabase.from("profiles").select("name_color").eq("user_id", userId).maybeSingle();
  return data?.name_color === RESERVED_DEV_COLOR;
}

/** Bypass flag plus verified status — the two facts moderation decisions depend on. */
export async function getModerationContext(
  supabase: SupabaseClient,
  userId: string
): Promise<{ bypass: boolean; verified: boolean }> {
  const bypass = await canBypassModeration(supabase, userId);
  if (bypass) return { bypass: true, verified: true };
  const { data } = await supabase.from("profiles").select("verified").eq("user_id", userId).maybeSingle();
  return { bypass: false, verified: data?.verified === true };
}

export async function canBypassModeration(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const cookieStore = await cookies();
  if (verifyAdminToken(cookieStore.get(adminCookieName())?.value)) return true;

  const full = await supabase
    .from("profiles")
    .select("name_color, bypass_moderation")
    .eq("user_id", userId)
    .maybeSingle();
  if (!full.error) {
    return full.data?.bypass_moderation === true || full.data?.name_color === RESERVED_DEV_COLOR;
  }
  const basic = await supabase.from("profiles").select("name_color").eq("user_id", userId).maybeSingle();
  return basic.data?.name_color === RESERVED_DEV_COLOR;
}
