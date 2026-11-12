import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Thin server-side proxy to GIPHY's search/trending endpoints — keeps the
// API key off the client and lets us trim GIPHY's (fairly large) response
// down to just what the picker UI needs.
export interface GifResult {
  id: string;
  url: string; // the actual GIF to attach (GIPHY's "original" rendition)
  previewUrl: string; // small looping preview for the picker grid
  width: number;
  height: number;
}

interface GiphyImageRendition {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  images: {
    original: GiphyImageRendition;
    fixed_width_small?: GiphyImageRendition;
    fixed_width?: GiphyImageRendition;
  };
}

function mapGif(g: GiphyGif): GifResult | null {
  const original = g.images.original;
  const preview = g.images.fixed_width_small ?? g.images.fixed_width ?? original;
  if (!original?.url) return null;
  return {
    id: g.id,
    url: original.url,
    previewUrl: preview.url,
    width: Number(original.width) || 0,
    height: Number(original.height) || 0,
  };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GIFs aren't set up yet." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") || "").trim();
  const offset = Math.max(0, Number(searchParams.get("offset")) || 0);

  const endpoint = q
    ? `https://api.giphy.com/v1/gifs/search?${new URLSearchParams({
        api_key: apiKey,
        q,
        limit: "25",
        offset: String(offset),
        rating: "pg-13",
        lang: "en",
      })}`
    : `https://api.giphy.com/v1/gifs/trending?${new URLSearchParams({
        api_key: apiKey,
        limit: "25",
        offset: String(offset),
        rating: "pg-13",
      })}`;

  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "Couldn't reach GIPHY right now." }, { status: 502 });
    const json = (await res.json()) as { data: GiphyGif[] };
    const items = (json.data ?? []).map(mapGif).filter((g): g is GifResult => g !== null);
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Couldn't reach GIPHY right now." }, { status: 502 });
  }
}
