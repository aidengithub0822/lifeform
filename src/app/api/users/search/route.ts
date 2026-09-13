import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/users/search?q=... — username lookup for the "Find people"
// search in Settings. Usernames are unique, so this is a reliable way to
// find someone by handle rather than scrolling through posts hoping to
// spot them.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return NextResponse.json({ items: [] });

  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username, avatar_url, name_color, verified, rank")
    .ilike("username", `%${q}%`)
    .neq("user_id", user.id)
    .order("username", { ascending: true })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}
