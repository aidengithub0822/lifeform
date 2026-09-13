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

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("user_id", user.id)
    .maybeSingle<{ username: string | null }>();

  if (!profile?.username) redirect("/onboarding");

  redirect(`/profile/${encodeURIComponent(profile.username)}`);
}
