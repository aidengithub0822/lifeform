"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EXEMPT_PREFIXES = ["/login", "/signup", "/onboarding", "/auth", "/install"];

/**
 * Global backstop for the "every account needs a username" rule. The main
 * enforcement is server-side on "/" and "/profile" (see those pages), but a
 * signed-in user can deep-link straight into any other route (a push
 * notification, a bookmark, a shared link) without ever passing through
 * either — this catches that case client-side, on every page, without
 * needing a server-side auth check bolted onto every single route.
 */
export default function UsernameGate() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return;
    let cancelled = false;
    async function check() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle<{ username: string | null }>();
      // A transient read failure must not be treated as "no username" —
      // that was capable of bouncing an already-onboarded user back into
      // onboarding on any brief hiccup. Just skip the check this time.
      if (error) return;
      if (!cancelled && !profile?.username) router.replace("/onboarding");
    }
    check();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
