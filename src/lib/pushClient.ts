// Shared Web Push helpers used by the Settings toggle (PushOptIn) and the
// "turn on notifications" popup (NotificationPrompt).
//
// iOS only supports Web Push for a PWA that's been "Added to Home Screen"
// and needs iOS 16.4+, so plain Safari on iPhone can't be asked at all.

export type PushState = "unsupported" | "not-ios-installed" | "denied" | "off" | "on";

/** Fired on window once a new account has saved its username, so the popup can appear right then. */
export const USERNAME_SET_EVENT = "lf-username-set";

export function announceUsernameSet() {
  try {
    window.dispatchEvent(new Event(USERNAME_SET_EVENT));
  } catch {
    // ignore
  }
}

export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function getPushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    // iPhone Safari (not installed) hides these APIs entirely — that's the
    // "add me to your Home Screen" case, not "your device can't ever do it".
    const isIosBrowser = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      // @ts-expect-error -- iOS Safari-only property
      window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    return isIosBrowser && !standalone ? "not-ios-installed" : "unsupported";
  }
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    // @ts-expect-error -- iOS Safari-only property
    window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  if (isIos && !standalone) return "not-ios-installed";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "unsupported";
  }
}

export type EnablePushResult = { ok: true } | { ok: false; denied?: boolean; error: string };

/** Asks for permission, subscribes this device, and saves the subscription. Must be called from a tap. */
export async function enablePush(): Promise<EnablePushResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, denied: permission === "denied", error: "Notifications weren't allowed." };
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return { ok: false, error: "Push isn't configured on the server yet." };
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
    const json = sub.toJSON();
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return { ok: false, error: b.error || "Couldn't save that subscription" };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't enable notifications on this device." };
  }
}
