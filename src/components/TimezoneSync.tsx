"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps profiles.timezone in sync with the device's actual IANA timezone so
 * every server-side "what day is it" decision (streak growth, the home
 * page's "today", Coach's date context — see src/lib/timezone.ts) uses the
 * user's real local day instead of defaulting to UTC. Runs once per app
 * load, and only writes when the stored value actually differs, so it's a
 * no-op read on every subsequent visit until the user travels or their
 * clock/region setting changes.
 */
export default function TimezoneSync() {
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      let deviceTz: string;
      try {
        deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return; // Extremely old/unusual runtime — just skip, UTC fallback still works.
      }
      if (!deviceTz) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("timezone")
        .eq("user_id", user.id)
        .maybeSingle<{ timezone: string | null }>();
      if (cancelled) return;
      if (profile && profile.timezone !== deviceTz) {
        await supabase.from("profiles").update({ timezone: deviceTz }).eq("user_id", user.id);
      }
    }
    sync();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot client check on mount
  }, []);

  return null;
}
