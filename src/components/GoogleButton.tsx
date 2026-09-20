"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// "Continue with Google" — works for both signing up and logging in (Supabase
// creates the account on first use). Needs the Google provider enabled in
// Supabase (Authentication -> Sign In / Providers -> Google) with a Google
// OAuth client ID + secret; until then Supabase returns an error that we show.
export default function GoogleButton({ label = "Continue with Google" }: { label?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Returns to the callback route, which trades the code for a session
      // and lands on "/" (which sends brand-new accounts to onboarding).
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
    // On success the browser navigates away to Google, so no reset needed.
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-zinc-700 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
          <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
        </svg>
        {loading ? "Opening Google..." : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-zinc-800" />
      <span className="text-xs text-zinc-500">or</span>
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}
