"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Five predictable destinations: Home (today's snapshot), Train (log food +
// workout + plan/ideas), Coach (the AI — deliberately the CENTER tab, since
// it's the app's most important feature and now has real read/write access
// to your data, not just chat), Progress (weight/photos/trends), Profile
// (your public identity + account, which now also links out to
// Community/Messages at its top). Scan/Recipes/Community used to each get
// their own top-level tab — they now live inside Train/Profile so the
// bottom nav answers "where does X live" without growing past five items.
// Inline stroke icons, matching the app's design system (no emoji in the UI chrome).
function HomeIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </svg>
  );
}
function TrainIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 6.5l11 11M4 9V4h5M20 15v5h-5M4 4l7 7M20 20l-7-7" />
    </svg>
  );
}
function CoachIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4Z" />
      <path d="M6 12v1a6 6 0 0 0 12 0v-1M12 19v3M9 22h6" />
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

const tabs = [
  { href: "/", label: "Home", Icon: HomeIcon, matches: ["/"] },
  {
    href: "/train",
    label: "Train",
    Icon: TrainIcon,
    matches: ["/train", "/scan", "/fitness", "/recipes", "/discover"],
  },
  { href: "/coach", label: "Coach", Icon: CoachIcon, matches: ["/coach"] },
  { href: "/progress", label: "Progress", Icon: ProgressIcon, matches: ["/progress"] },
  {
    href: "/profile",
    label: "Profile",
    Icon: ProfileIcon,
    matches: ["/profile", "/social", "/community", "/messages"],
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const hidden = ["/login", "/signup", "/onboarding", "/auth"].some((p) =>
    pathname.startsWith(p)
  );
  if (hidden) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[#18181b] bg-[#0c0c0e]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map((tab) => {
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
                <span
                  className={`lf-glow -mt-5 flex h-11 w-11 items-center justify-center rounded-full border ${
                    active
                      ? "border-emerald-400 bg-emerald-500 text-black"
                      : "border-emerald-500/50 bg-zinc-900 text-emerald-400"
                  }`}
                >
                  <Icon />
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
