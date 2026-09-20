import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the redirect from Supabase's email confirmation link.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Optional landing page (used by "Continue with Google"). Only same-site
  // relative paths are honored so this can't be turned into an open redirect.
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(`${origin}/login`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
