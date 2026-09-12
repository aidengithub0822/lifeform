import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Feedback } from "@/lib/types";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Feedback[]>();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json();
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ error: "Comment can't be empty" }, { status: 400 });
  if (message.length > 2000) {
    return NextResponse.json({ error: "Keep it under 2000 characters" }, { status: 400 });
  }

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    author_email: user.email ?? null,
    message,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
