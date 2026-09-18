"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Six predictable destinations: Home (today's snapshot + quick links to
// Recipes/Meal ideas), Fitness (opens straight to the muscle-rank page —
// previously buried a tap deeper inside "Train"), Coach (the AI — the most
// visually prominent tab, since it's the app's most important feature and
// has real read/write access to your data, not just chat), Progress
// (weight/photos/trends), Social (the community feed), Profile (your public
// identity + account — DMs live behind the message-bubble icon there).
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
// A flexing figure (double-bicep pose) instead of a chat-bubble/mic glyph —
// this is the AI COACH tab, so it should read as "coach", not "chat".
function CoachIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4.3" r="2.1" />
      <path d="M12 7v7" />
      <path d="M12 8.3 8.6 6.8 7.2 3.8" />
      <path d="M12 8.3 15.4 6.8 16.8 3.8" />
      <path d="M12 14 9 21" />
      <path d="M12 14 15 21" />
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
    href: "/fitness",
    label: "Fitness",
    Icon: FitnessIcon,
    matches: ["/fitness", "/train", "/scan", "/recipes", "/discover"],
  },
  { href: "/coach", label: "Coach", Icon: CoachIcon, matches: ["/coach"] },
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
