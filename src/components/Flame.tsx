"use client";

import { useEffect, useState } from "react";
import { tierMeta, FREEZE_COST_XP, MAX_FREEZES, type FlameTier } from "@/lib/streak";

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  xp: number;
  flameTier: FlameTier;
  freezesAvailable: number;
  widgetToken: string;
  today: {
    loggedFoodToday: boolean;
    gymCountThisWeek: number;
    gymTarget: number;
    onTrackToGrow: boolean;
  };
}

// iOS 16.4+ standalone PWAs support the Badging API — puts a small number
// on the app icon itself, visible without opening the app. No-op (silently)
// on anything that doesn't support it.
function syncAppBadge(streak: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (streak > 0 && nav.setAppBadge) nav.setAppBadge(streak).catch(() => {});
    else if (nav.clearAppBadge) nav.clearAppBadge().catch(() => {});
  } catch {
    // Unsupported browser — ignore.
  }
}

export default function Flame() {
  const [data, setData] = useState<StreakData | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch("/api/streak");
    if (res.ok) {
      const json = await res.json();
      setData(json);
      syncAppBadge(json.currentStreak);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    load();
  }, []);

  async function logWorkoutToday() {
    setBusy(true);
    await fetch("/api/workouts", { method: "POST" });
    await load();
    setBusy(false);
  }

  async function buyFreeze() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/streak/buy-freeze", { method: "POST" });
    const body = await res.json();
    if (!res.ok) setMsg(body.error);
    await load();
    setBusy(false);
  }

  if (!data) {
    return <div className="h-9 w-16 animate-pulse rounded-full bg-zinc-800" />;
  }

  const meta = tierMeta(data.flameTier);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5"
      >
        <FlameIcon color={meta.color} lit={data.today.loggedFoodToday} />
        <span className="text-sm font-bold" style={{ color: meta.color }}>
          {data.currentStreak}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-3xl border-t border-zinc-800 bg-zinc-950 p-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-700" />
            <div className="flex flex-col items-center">
              <FlameIcon color={meta.color} lit={data.today.loggedFoodToday} size={56} />
              <p className="mt-2 text-3xl font-extrabold" style={{ color: meta.color }}>
                {data.currentStreak} day{data.currentStreak === 1 ? "" : "s"}
              </p>
              <p className="text-sm text-zinc-400">{meta.label} tier · longest {data.longestStreak}</p>
            </div>

            <div className="mt-6 space-y-3 rounded-2xl bg-zinc-900 p-4">
              <Row label="Food logged today" value={data.today.loggedFoodToday ? "Yes ✅" : "Not yet"} />
              <Row
                label="Gym days this week"
                value={`${data.today.gymCountThisWeek} / ${data.today.gymTarget}`}
              />
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (data.today.gymCountThisWeek / data.today.gymTarget) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-zinc-500">
                {data.today.onTrackToGrow
                  ? "You're on track — the flame grows today."
                  : "Log food + hit your weekly gym target to keep the flame growing."}
              </p>
            </div>

            <button
              onClick={logWorkoutToday}
              disabled={busy}
              className="mt-4 w-full rounded-xl bg-emerald-500 py-3 font-semibold text-black disabled:opacity-60"
            >
              Log today&apos;s training session
            </button>

            <div className="mt-4 flex items-center justify-between rounded-2xl bg-zinc-900 p-4">
              <div>
                <p className="text-sm font-semibold">{data.xp} XP</p>
                <p className="text-xs text-zinc-500">
                  {data.freezesAvailable}/{MAX_FREEZES} streak freezes
                </p>
              </div>
              <button
                onClick={buyFreeze}
                disabled={busy || data.freezesAvailable >= MAX_FREEZES || data.xp < FREEZE_COST_XP}
                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Buy freeze ({FREEZE_COST_XP} XP)
              </button>
            </div>
            {msg && <p className="mt-2 text-center text-xs text-red-400">{msg}</p>}
            <p className="mt-3 text-center text-[11px] text-zinc-600">
              A freeze auto-covers one missed day (sick day, travel, etc.) so your streak survives.
            </p>

            <div className="mt-5 rounded-2xl bg-zinc-900 p-4">
              <p className="text-sm font-semibold">Home Screen widget</p>
              <p className="mt-1 text-xs text-zinc-500">
                See the flame on your home screen without opening the app. Install the free{" "}
                <span className="text-zinc-300">Scriptable</span> app, create a new script with the
                one in this project&apos;s <code className="text-zinc-400">scriptable/</code> folder,
                then long-press your home screen → add a Scriptable widget → pick this script and
                paste in this URL when it asks for a parameter:
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  readOnly
                  value={
                    typeof window !== "undefined"
                      ? `${window.location.origin}/api/widget?token=${data.widgetToken}`
                      : ""
                  }
                  className="min-w-0 flex-1 truncate rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-[11px] text-zinc-400"
                />
                <button
                  onClick={() => {
                    navigator.clipboard
                      .writeText(`${window.location.origin}/api/widget?token=${data.widgetToken}`)
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      });
                  }}
                  className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-emerald-400"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-zinc-600">
                Treat this link like a password — anyone with it can see your streak.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function FlameIcon({ color, lit, size = 20 }: { color: string; lit: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      style={{ opacity: lit ? 1 : 0.35, filter: lit ? `drop-shadow(0 0 6px ${color}aa)` : "none" }}
    >
      <path d="M12 2c1 3-2 4-2 7a3 3 0 0 0 6 0c0-1-.3-1.8-.7-2.5 1.8 1.3 3.7 3.9 3.7 7a7 7 0 1 1-14 0c0-4.5 3-6.5 4.5-9.5C10 2.7 11 2 12 2z" />
    </svg>
  );
}
