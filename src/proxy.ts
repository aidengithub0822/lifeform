import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session on every request and redirects
// signed-out users away from protected pages.
// (Next.js 16 renamed this file convention from middleware.ts to proxy.ts.)
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicPaths = ["/login", "/signup", "/auth/callback", "/install"];
  const isPublic = publicPaths.some((p) => request.nextUrl.pathname.startsWith(p));
  // Every /api/* route already does its own auth check (a cookie session,
  // the dev-mode admin cookie, or — for /api/widget specifically — an
  // unguessable per-user token, since home-screen widgets can't hold a
  // browser session at all) and returns a proper JSON error when it fails.
  // Redirecting an unauthenticated API request to the (HTML) /login page
  // instead of letting the route respond is wrong for all of them: it's
  // what turned a perfectly valid /api/widget?token=... request from
  // Scriptable into /login?token=... — the query string survives the
  // rewrite below, but the path doesn't, so the widget got an HTML page
  // back and failed to parse it as JSON.
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  if (!user && !isPublic && !isApiRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
