"use client";

import { useEffect, useState } from "react";
import {
  detectPlatform,
  hasInstallPrompt,
  INSTALL_EVENT,
  isInstalledApp,
  runInstallPrompt,
  startInstallCapture,
  type Platform,
} from "@/lib/install";

type Tab = "android" | "ios";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-zinc-300">{children}</span>
    </li>
  );
}

/**
 * How to put lifeform on the home screen, for Android and iPhone. On Android
 * Chrome it also offers a one-tap Install button (when the browser allows it).
 * Shows "installed" once the app is running from the home screen.
 */
export default function InstallGuide() {
  const [tab, setTab] = useState<Tab>("android");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [installed, setInstalled] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    startInstallCapture();
    const p = detectPlatform();
    const t = setTimeout(() => {
      setPlatform(p);
      setTab(p === "ios" ? "ios" : "android");
      setInstalled(isInstalledApp());
      setCanPrompt(hasInstallPrompt());
    }, 0);
    const onChange = () => {
      setCanPrompt(hasInstallPrompt());
      setInstalled(isInstalledApp());
    };
    window.addEventListener(INSTALL_EVENT, onChange);
    return () => {
      clearTimeout(t);
      window.removeEventListener(INSTALL_EVENT, onChange);
    };
  }, []);

  async function install() {
    setBusy(true);
    await runInstallPrompt();
    setBusy(false);
  }

  if (installed) {
    return (
      <div className="rounded-2xl border border-emerald-900/50 bg-emerald-500/10 p-4">
        <p className="text-sm font-semibold text-emerald-300">lifeform is installed ✓</p>
        <p className="mt-1 text-xs text-emerald-200/70">You&apos;re using it from your home screen — nothing more to do.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canPrompt && (
        <button
          onClick={install}
          disabled={busy}
          className="w-full rounded-2xl bg-emerald-500 py-3.5 text-sm font-bold text-black disabled:opacity-60"
        >
          {busy ? "Opening…" : "Install lifeform"}
        </button>
      )}

      <div className="flex gap-1 rounded-full bg-zinc-900 p-1">
        {(
          [
            ["android", "Android"],
            ["ios", "iPhone"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-full py-2 text-sm font-semibold ${tab === key ? "bg-emerald-500 text-black" : "text-zinc-400"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "android" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm font-semibold text-zinc-100">Chrome (most Android phones)</p>
            <ol className="mt-3 space-y-3">
              <Step n={1}>Open lifeform in <b className="text-zinc-100">Chrome</b>.</Step>
              <Step n={2}>Tap the <b className="text-zinc-100">⋮ menu</b> (three dots, top right).</Step>
              <Step n={3}>
                Tap <b className="text-zinc-100">Add to Home screen</b> (some phones say <b className="text-zinc-100">Install app</b>).
              </Step>
              <Step n={4}>Tap <b className="text-zinc-100">Install</b> (or <b className="text-zinc-100">Add</b>) to confirm.</Step>
              <Step n={5}>Open <b className="text-zinc-100">lifeform</b> from your home screen — it runs full-screen like a normal app.</Step>
            </ol>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm font-semibold text-zinc-100">Samsung Internet</p>
            <ol className="mt-3 space-y-3">
              <Step n={1}>Tap the <b className="text-zinc-100">≡ menu</b> (bottom right).</Step>
              <Step n={2}>Tap <b className="text-zinc-100">Add page to</b> → <b className="text-zinc-100">Home screen</b>.</Step>
            </ol>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <p className="text-sm font-semibold text-zinc-100">Firefox</p>
            <ol className="mt-3 space-y-3">
              <Step n={1}>Tap the <b className="text-zinc-100">⋮ menu</b>, then <b className="text-zinc-100">Install</b>.</Step>
            </ol>
          </div>
        </div>
      )}

      {tab === "ios" && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="text-sm font-semibold text-zinc-100">iPhone / iPad (Safari)</p>
          <ol className="mt-3 space-y-3">
            <Step n={1}>Open lifeform in <b className="text-zinc-100">Safari</b> (it has to be Safari, not Chrome).</Step>
            <Step n={2}>Tap the <b className="text-zinc-100">Share</b> button (the square with an arrow).</Step>
            <Step n={3}>Scroll down and tap <b className="text-zinc-100">Add to Home Screen</b>.</Step>
            <Step n={4}>Tap <b className="text-zinc-100">Add</b>, then open lifeform from your home screen.</Step>
          </ol>
        </div>
      )}

      <p className="text-xs leading-relaxed text-zinc-500">
        Once it&apos;s on your home screen, open it from there and tap <b className="text-zinc-400">Turn on notifications</b> when
        asked — that&apos;s how you get pings for messages, tags and replies.
        {platform === "desktop" && " (Open this page on your phone to install it there.)"}
      </p>
    </div>
  );
}
