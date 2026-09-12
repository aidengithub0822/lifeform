import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types";

// Server-side Supabase client for use in Route Handlers and Server Components.
// Uses the request's cookies so all queries run as the logged-in user and
// respect Row Level Security — no service-role key needed for normal reads/writes.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll called from a Server Component without a response to write to.
            // Safe to ignore when middleware is refreshing sessions.
          }
        },
      },
    }
  );
}
