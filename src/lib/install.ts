// "Add to Home screen" support. Android Chrome (and other Chromium browsers)
// fire `beforeinstallprompt` once, early, when the app is installable; we grab
// it at app start (InstallCapture) so the Install button can use it later.
// iPhone has no such event, and Firefox/Samsung Internet don't always fire it,
// so the guide always shows manual steps too.

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

/** Fired on window when the deferred install prompt becomes available or is used up. */
export const INSTALL_EVENT = "lf-install-available";

let deferred: BeforeInstallPromptEvent | null = null;
let started = false;

export function startInstallCapture() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own button instead of Chrome's mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_EVENT));
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    window.dispatchEvent(new Event(INSTALL_EVENT));
  });
}

export function hasInstallPrompt(): boolean {
  return deferred !== null;
}

/** Shows the browser's native install dialog. Returns true if the user accepted. */
export async function runInstallPrompt(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  window.dispatchEvent(new Event(INSTALL_EVENT));
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    return choice.outcome === "accepted";
  } catch {
    return false;
  }
}

export type Platform = "android" | "ios" | "desktop";

export function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  return "desktop";
}

export function isInstalledApp(): boolean {
  try {
    return (
      // @ts-expect-error -- iOS Safari-only property
      window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches
    );
  } catch {
    return false;
  }
}
