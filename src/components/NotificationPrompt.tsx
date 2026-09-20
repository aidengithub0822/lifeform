"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { enablePush, getPushState, USERNAME_SET_EVENT } from "@/lib/pushClient";
import { BellIcon } from "@/components/icons";

// "Turn on notifications" popup. Shown when the app opens for a signed-in
// account that has a username and doesn't have push notifications on yet —
// which includes brand-new accounts, right after they pick their username
// (onboarding fires USERNAME_SET_EVENT). "Not now" hides it until the app is
// opened again (sessionStorage), so it doesn't nag on every screen change.
// Skipped where the browser can't do push at all, and where permission was
// already blocked (the browser won't let us ask again).

const EXEMPT_PREFIXES = ["/login", "/signup", "/auth"];
const DISMISS_KEY = "lf_push_prompt_dismissed";

type Mode = "ask" | "install" | "blocked-note" | null;

function dismissedThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export default function NotificationPrompt() {
  const pathname = usePathname();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return;
    let cancelled = false;

    async function evaluate() {
      if (cancelled || dismissedThisSession()) return;
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      // Brand-new accounts get the popup only once they've made a username.
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("user_id", user.id)
        .maybeSingle<{ username: string | null }>();
      if (!profile?.username || cancelled) return;

      const state = await getPushState();
      if (cancelled) return;
      if (state === "off") setMode((cur) => cur ?? "ask");
      else if (state === "not-ios-installed") setMode((cur) => cur ?? "install");
    }

    // Wait out the splash screen and let the page settle before interrupting.
    const timer = setTimeout(evaluate, 1500);
    const onUsername = () => setTimeout(evaluate, 600);
    window.addEventListener(USERNAME_SET_EVENT, onUsername);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(USERNAME_SET_EVENT, onUsername);
    };
  }, [pathname]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setMode(null);
    setError(null);
  }

  async function turnOn() {
    setBusy(true);
    setError(null);
    const result = await enablePush();
    setBusy(false);
    if (result.ok) {
      setMode(null);
      return;
    }
    if (result.denied) {
      setMode("blocked-note");
      return;
    }
    setError(result.error);
  }

  if (!mode) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 px-4 pb-[max(env(safe-area-inset-bottom),16px)] sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
          <BellIcon className="h-6 w-6" />
        </div>

        {mode === "ask" && (
          <>
            <h2 className="mt-3 text-lg font-bold text-white">Turn on notifications</h2>
            <p className="mt-1.5 text-sm text-zinc-400">
              Get a ping when someone tags you, replies to you, or sends you a message — even when the app is closed.
            </p>
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <button
              onClick={turnOn}
              disabled={busy}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black disabled:opacity-60"
            >
              {busy ? "Turning on…" : "Turn on notifications"}
            </button>
            <button onClick={dismiss} className="mt-2 w-full rounded-xl py-2.5 text-sm font-medium text-zinc-400">
              Not now
            </button>
          </>
        )}

        {mode === "install" && (
          <>
            <h2 className="mt-3 text-lg font-bold text-white">Get notifications on iPhone</h2>
            <p className="mt-1.5 text-sm text-zinc-400">
              On iPhone, notifications only work once lifeform is on your Home Screen. Tap the Share icon in Safari →
              &quot;Add to Home Screen&quot;, then open lifeform from there and we&apos;ll ask again.
            </p>
            <button onClick={dismiss} className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black">
              Got it
            </button>
          </>
        )}

        {mode === "blocked-note" && (
          <>
            <h2 className="mt-3 text-lg font-bold text-white">Notifications are blocked</h2>
            <p className="mt-1.5 text-sm text-zinc-400">
              Your device said no. To get pings, turn notifications back on for lifeform in your device or browser
              settings.
            </p>
            <button onClick={dismiss} className="mt-4 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-black">
              OK
            </button>
          </>
        )}
      </div>
    </div>
  );
}
