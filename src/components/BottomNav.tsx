"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Six predictable destinations: Home (today's snapshot + quick links to
// Recipes/Meal ideas), Fitness (opens straight to the muscle-rank page —
// previously buried a tap deeper inside "Train"), Progress (weight/photos/
// trends), Social (the community feed), Profile (your public identity +
// account — DMs live behind the message-bubble icon there), and Coach last —
// deliberately at the end rather than the middle of a 6-tab row (a middle
// slot only reads as "the important one" with an odd tab count), but still
// the most visually prominent icon via the raised glowing badge below.
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
