import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PushSubscriptionRow } from "@/lib/types";

// Server-only. Sends a Web Push notification to every device a user has
// opted in on, using the service-role client to read subscriptions
// (bypasses RLS — this never runs in a browser). Dead subscriptions (the
// browser un-registered, or the endpoint expired) are cleaned up as they're
// discovered rather than left to pile up.

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/** Sends `payload` to every subscription on file for `userId`. Best-effort — never throws. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return; // VAPID keys not set up yet — silently no-op
  const admin = createAdminClient();
  const { data } = await admin
    .from("push_subscriptions")
    .select("*")
    .eq("user_id", userId)
    .returns<PushSubscriptionRow[]>();

  const subs = data ?? [];
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth_key },
          },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription is gone on the browser's end — stop trying it.
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      }
    })
  );
}
