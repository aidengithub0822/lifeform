"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Five predictable destinations, per the IA redesign: Home (today's
// snapshot), Train (log food + workout + plan/ideas), Social (community,
// messages, find people), Progress (weight/photos/trends), Profile (your
// public identity + account). Scan/Recipes/Community used to each get their
// own top-level tab — they now live inside Train/Social so the bottom nav
// answers "where does X live" without growing past five items.
const tabs = [
  { href: "/", label: "Home", icon: "🏠", matches: ["/"] },
  {
    href: "/train",
    label: "Train",
    icon: "💪",
    matches: ["/train", "/scan", "/fitness", "/recipes", "/discover", "/coach"],
  },
  { href: "/social", label: "Social", icon: "🌐", matches: ["/social", "/community", "/messages"] },
  { href: "/progress", label: "Progress", icon: "📈", matches: ["/progress"] },
  { href: "/profile", label: "Profile", icon: "👤", matches: ["/profile"] },
];

export default function BottomNav() {
  const pathname = usePathname();
  const hidden = ["/login", "/signup", "/onboarding", "/auth"].some((p) =>
    pathname.startsWith(p)
  );
  if (hidden) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md justify-around">
        {tabs.map((tab) => {
          // "/" only matches exactly; every other tab also covers the
          // existing standalone routes it now aggregates (e.g. Train stays
          // highlighted on /fitness, /scan, /recipes, /discover, /coach).
          const active = tab.matches.some((m) =>
            m === "/" ? pathname === "/" : pathname === m || pathname.startsWith(m + "/")
          );
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
                active ? "text-emerald-400" : "text-zinc-500"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
