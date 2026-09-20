import { createAdminClient } from "@/lib/supabase/admin";

// Public URLs of files a user uploaded to the app's "profile-media" bucket
// look like <supabase url>/storage/v1/object/public/profile-media/<user id>/<file>.
// The server only ever fetches / trusts URLs of exactly that shape, and only
// under the caller's own folder — never an arbitrary URL from the client.

function publicPrefix(userId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/profile-media/${userId}/`;
}

/** True if `url` is a profile-media file inside this user's own folder. */
export function isOwnMediaUrl(userId: string, url: string): boolean {
  const prefix = publicPrefix(userId);
  return !!prefix && url.startsWith(prefix);
}

/** Best-effort delete of an uploaded file (used when a photo fails moderation). */
export async function removeOwnMedia(userId: string, url: string): Promise<void> {
  const prefix = publicPrefix(userId);
  if (!prefix || !url.startsWith(prefix)) return;
  const rest = url.slice(prefix.length).split("?")[0];
  try {
    const admin = createAdminClient();
    await admin.storage.from("profile-media").remove([`${userId}/${decodeURIComponent(rest)}`]);
  } catch {
    // leaving an orphaned file is harmless — it just isn't referenced anywhere
  }
}
