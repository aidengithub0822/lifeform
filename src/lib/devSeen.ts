// Developer-mode "new users" tracking. The Dev page and the nav badge share
// one per-device timestamp: the newest profile you've already seen. Anything
// that joined after it counts as new. Stored in localStorage (this is the
// developer's own device convenience, not app data), wrapped in try/catch
// because storage can be blocked or empty (private mode, cleared data).

const KEY = "lf_dev_seen";

/** Fired on window when the seen-marker changes, so the nav badge can clear itself. */
export const DEV_SEEN_EVENT = "lf-dev-seen";
/** Fired on window (detail: boolean) when developer mode is unlocked or exited. */
export const DEV_MODE_EVENT = "lf-dev-mode";

export function getDevSeen(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setDevSeen(iso: string) {
  try {
    window.localStorage.setItem(KEY, iso);
  } catch {
    // Storage unavailable — the badge just won't persist across reloads.
  }
  try {
    window.dispatchEvent(new Event(DEV_SEEN_EVENT));
  } catch {
    // ignore
  }
}

export function announceDevMode(on: boolean) {
  try {
    window.dispatchEvent(new CustomEvent(DEV_MODE_EVENT, { detail: on }));
  } catch {
    // ignore
  }
}
