"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DEV_MODE_EVENT, DEV_SEEN_EVENT, getDevSeen, setDevSeen } from "@/lib/devSeen";

// Six predictable destinations: Home (today's snapshot + quick links to
// Recipes/Meal ideas), Fitness (opens straight to the muscle-rank page —
// previously buried a tap deeper inside "Train"), Progress (weight/photos/
// trends), Social (the community feed), Profile (your public identity +
// account — DMs live behind the message-bubble icon there), and Coach last —
// deliberately at the end rather than the middle of a 6-tab row (a middle
// slot only reads as "the important one" with an odd tab count). It sits
// in line with every other tab (no raised badge) — the .lf-ai-aura ring
// around its icon is what marks it as the AI, not its position or size.
// Inline stroke icons, matching the app's design system (no emoji in the UI chrome).
function HomeIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function FitnessIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8v8M2 10v4M20 8v8M22 10v4M6.5 12h11" />
    </svg>
  );
}
function SocialIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
    </svg>
  );
}
// A four-point "sparkle" pair — the same visual shorthand for "AI" used by
// Gemini/Copilot/etc — filled rather than stroked so it reads as a distinct
// symbol/logo mark rather than another line icon in the row.
function CoachIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M12 2c.6 3.4 1.7 5.6 3.2 7.1 1.5 1.5 3.7 2.6 7.1 3.2-3.4.6-5.6 1.7-7.1 3.2-1.5 1.5-2.6 3.7-3.2 7.1-.6-3.4-1.7-5.6-3.2-7.1C7.3 14 5.1 12.9 1.7 12.3c3.4-.6 5.6-1.7 7.1-3.2C10.3 7.6 11.4 5.4 12 2Z" />
      <path d="M19 2.5c.3 1.4.8 2.3 1.7 3.2.9.9 1.8 1.4 3.2 1.7-1.4.3-2.3.8-3.2 1.7-.9.9-1.4 1.8-1.7 3.2-.3-1.4-.8-2.3-1.7-3.2-.9-.9-1.8-1.4-3.2-1.7 1.4-.3 2.3-.8 3.2-1.7.9-.9 1.4-1.8 1.7-3.2Z" />
    </svg>
  );
}
function ProgressIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17l5-6 4 4 5-8 4 5" />
    </svg>
  );
}
function ProfileIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}

// Developer-mode-only tab: appears after the code is entered in Settings,
// disappears when developer mode is exited. The badge counts profiles created
// since the last time the Dev page was opened.
function DevIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />
    </svg>
  );
}

const DEV_TAB = { href: "/dev", label: "Dev", Icon: DevIcon, matches: ["/dev"] };

const tabs = [
  { href: "/", label: "Home", Icon: HomeIcon, matches: ["/"] },
  {
    href: "/fitness",
    label: "Fitness",
    Icon: FitnessIcon,
    matches: ["/fitness", "/train", "/scan", "/recipes", "/discover"],
  },
  { href: "/progress", label: "Progress", Icon: ProgressIcon, matches: ["/progress"] },
  {
    href: "/community",
    label: "Social",
    Icon: SocialIcon,
    matches: ["/community", "/social"],
  },
  {
    href: "/profile",
    label: "Profile",
    Icon: ProfileIcon,
    matches: ["/profile", "/messages"],
  },
  { href: "/coach", label: "Coach", Icon: CoachIcon, matches: ["/coach"] },
];

export default function BottomNav() {
  const pathname = usePathname();
  const hidden = ["/login", "/signup", "/onboarding", "/auth"].some((p) =>
    pathname.startsWith(p)
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [newCount, setNewCount] = useState(0);

  // Is developer mode unlocked? Checked once on load, and again whenever
  // Settings unlocks/exits it (DEV_MODE_EVENT) — no polling needed for this.
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    fetch("/api/admin/status")
      .then((r) => r.json())
      .then((b) => {
        if (!cancelled) setIsAdmin(!!b.isAdmin);
      })
      .catch(() => {});
    const onMode = (e: Event) => setIsAdmin(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener(DEV_MODE_EVENT, onMode);
    return () => {
      cancelled = true;
      window.removeEventListener(DEV_MODE_EVENT, onMode);
    };
  }, [hidden]);

  // While in developer mode, poll (cheap summary call) for profiles created
  // since the Dev page was last opened, and show the count as a badge.
  const checkNew = useCallback(async () => {
    try {
      const seen = getDevSeen();
      const res = await fetch(`/api/admin/users?summary=1${seen ? `&since=${encodeURIComponent(seen)}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = await res.json();
      if (!seen) {
        // First time on this device: start counting from now instead of
        // flagging every existing user as "new".
        if (body.newest) setDevSeen(body.newest);
        setNewCount(0);
        return;
      }
      setNewCount(typeof body.newCount === "number" ? body.newCount : 0);
    } catch {
      // Badge is best-effort.
    }
  }, []);

  useEffect(() => {
    if (!isAdmin || hidden) return;
    const first = setTimeout(checkNew, 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") checkNew();
    }, 45_000);
    window.addEventListener(DEV_SEEN_EVENT, checkNew);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      window.removeEventListener(DEV_SEEN_EVENT, checkNew);
    };
  }, [isAdmin, hidden, checkNew]);

  if (hidden) return null;

  const allTabs = isAdmin ? [...tabs, DEV_TAB] : tabs;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#18181b] bg-[#0c0c0e]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md justify-around">
        {allTabs.map((tab) => {
          // "/" only matches exactly; every other tab also covers the
          // existing standalone routes it now aggregates (e.g. Train stays
          // highlighted on /fitness, /scan, /recipes, /discover, /coach).
          const active = tab.matches.some((m) =>
            m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(m + "/")
          );
          const Icon = tab.Icon;
          const isCoach = tab.href === "/coach";
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium ${
                active ? "text-[#10b981] font-semibold" : "text-[#52525b]"
              }`}
            >
              {isCoach ? (
                <span className="lf-ai-aura flex h-[21px] w-[21px] items-center justify-center rounded-full">
                  <Icon />
                </span>
              ) : tab.href === "/dev" ? (
                <span className="relative flex">
                  <Icon />
                  {isAdmin && newCount > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white">
                      {newCount > 9 ? "9+" : newCount}
                    </span>
                  )}
                </span>
              ) : (
                <Icon />
              )}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
