import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Profile as a first-class bottom-nav destination. Previously the only way
// to reach your own profile was a link buried inside the HeaderMenu
// Settings sheet — this gives "Profile" a stable, predictable entry point
// that just forwards to the existing dynamic route.
export default async function ProfileRedirectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle<{ username: string | null }>();

  // Same guard as "/" — a transient read failure must not be treated as
  // "no username yet" and send an already-onboarded user back through
  // onboarding.
  if (error) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <p className="text-sm text-zinc-400">Couldn&apos;t load your profile just now.</p>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- deliberate hard reload, not a client nav, so it never reuses a cached RSC response */}
        <a
          href="/profile"
          className="mt-4 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black"
        >
          Try again
        </a>
      </div>
    );
  }

  if (!profile?.username) redirect("/onboarding");

  redirect(`/profile/${encodeURIComponent(profile.username)}`);
}
