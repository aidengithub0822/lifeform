import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely.
 * SERVER-ONLY. Never import this from a Client Component, and never expose
 * SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix.
 *
 * Used exclusively by /api/widget, which authenticates a request not by
 * cookie session (Scriptable/home-screen widgets can't hold a browser
 * session) but by an unguessable per-user widget_token, then uses this
 * client to look up that one user's row directly.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
