import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { adminCookieName, verifyAdminToken } from "@/lib/adminAuth";

// GET — developer-mode only. Everyone who has a profile in the app, newest
// first, for the Dev page and its "someone new joined" alerts.
//
//   /api/admin/users                 -> { total, users: [...] }
//   /api/admin/users?since=<ISO>     -> { total, newCount, latest, users }  (newCount = joined after `since`)
//   /api/admin/users?summary=1&since -> same as above but without the full `users` list (cheap poll for the nav badge)
//
// Uses the service-role client, so it never runs unless the signed `lf_admin`
// cookie from /api/admin/verify is present and valid. Emails are deliberately
// NOT returned — the Dev page is for "who's in the app", not contact data.
export async function GET(request: Request) {
  const cookieStore = await cookies();
  if (!verifyAdminToken(cookieStore.get(adminCookieName())?.value)) {
    return NextResponse.json({ error: "Developer mode required" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const summaryOnly = searchParams.get("summary") === "1";
  const sinceRaw = searchParams.get("since");
  const sinceMs = sinceRaw ? Date.parse(sinceRaw) : NaN;

  const admin = createAdminClient();
  // bypass_moderation only exists once the latest schema.sql has been run —
  // fall back to the older column set so this page never breaks over it.
  const baseCols = "user_id, username, avatar_url, name_color, verified, rank, created_at";
  const first = await admin
    .from("profiles")
    .select(`${baseCols}, bypass_moderation`)
    .order("created_at", { ascending: false })
    .limit(2000);
  let profiles: unknown[] | null = first.data;
  let error: { message: string } | null = first.error;
  if (error) {
    const fallback = await admin
      .from("profiles")
      .select(baseCols)
      .order("created_at", { ascending: false })
      .limit(2000);
    profiles = fallback.data;
    error = fallback.error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (profiles ?? []) as Array<{
    user_id: string;
    username: string;
    avatar_url: string | null;
    name_color: string | null;
    verified: boolean;
    rank: string;
    created_at: string;
    bypass_moderation?: boolean;
  }>;
  const newRows = Number.isFinite(sinceMs) ? rows.filter((p) => Date.parse(p.created_at) > sinceMs) : [];
  const latest = rows.slice(0, 5).map((p) => ({ user_id: p.user_id, username: p.username, created_at: p.created_at }));
  const base = {
    total: rows.length,
    newCount: newRows.length,
    newest: rows[0]?.created_at ?? null,
    latest,
  };
  if (summaryOnly) return NextResponse.json(base);

  // Last sign-in comes from Supabase Auth (service role only). Best-effort:
  // if the lookup fails the list still renders, just without that column.
  const lastSignIn = new Map<string, string | null>();
  const bannedUntil = new Map<string, string | null>();
  try {
    for (let page = 1; page <= 10; page++) {
      const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listErr || !data) break;
      for (const u of data.users) {
        lastSignIn.set(u.id, u.last_sign_in_at ?? null);
        bannedUntil.set(u.id, (u as { banned_until?: string | null }).banned_until ?? null);
      }
      if (data.users.length < 1000) break;
    }
  } catch {
    // ignore
  }

  return NextResponse.json({
    ...base,
    users: rows.map((p) => ({
      user_id: p.user_id,
      username: p.username,
      avatar_url: p.avatar_url,
      name_color: p.name_color,
      verified: p.verified,
      rank: p.rank,
      created_at: p.created_at,
      last_sign_in_at: lastSignIn.get(p.user_id) ?? null,
      bypass_moderation: p.bypass_moderation === true,
      banned_until: (() => {
        const b = bannedUntil.get(p.user_id);
        return b && Date.parse(b) > Date.now() ? b : null;
      })(),
    })),
  });
}
