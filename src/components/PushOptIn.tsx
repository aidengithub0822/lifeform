"use client";

import { useEffect, useState } from "react";
import { enablePush, getPushState, type PushState } from "@/lib/pushClient";

// iOS only supports Web Push for a PWA that's been "Added to Home Screen"
// (Settings not accepted from inside plain Safari) and needs iOS 16.4+.
// This component degrades quietly on anything that can't do it at all.

export default function PushOptIn() {
  const [status, setStatus] = useState<PushState>("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPushState().then(setStatus);
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    const result = await enablePush();
    if (result.ok) setStatus("on");
    else if (result.denied) setStatus("denied");
    else setError(result.error);
    setBusy(false);
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("Couldn't turn notifications off.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "unsupported") return null; // nothing sane to show

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-sm font-semibold text-zinc-300">Notifications</p>
      {status === "not-ios-installed" ? (
        <p className="mt-1 text-xs text-zinc-500">
          On iPhone, notifications only work once lifeform is added to your Home Screen: tap the Share
          icon in Safari → &quot;Add to Home Screen&quot;, then open it from there and come back here.
        </p>
      ) : status === "denied" ? (
        <p className="mt-1 text-xs text-zinc-500">
          Notifications are blocked for lifeform in your device settings — enable them there to turn this
          back on.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-zinc-500">
            Get notified about new messages, followers, and replies even when the app is closed.
          </p>
          <button
            onClick={status === "on" ? disable : enable}
            disabled={busy}
            className={`mt-3 w-full rounded-xl py-2 text-xs font-semibold disabled:opacity-60 ${
              status === "on" ? "bg-zinc-800 text-zinc-300" : "bg-emerald-500 text-black"
            }`}
          >
            {busy ? "..." : status === "on" ? "Turn off notifications" : "Enable notifications"}
          </button>
        </>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
