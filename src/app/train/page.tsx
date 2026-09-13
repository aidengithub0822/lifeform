import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Train: the home for everything that moves you toward your goal day to
// day — logging food, following a workout, recipes, and the AI coach.
// Consolidates what used to be four unrelated tiles buried at the bottom
// of Home (Fitness, Discover, Coach) plus the Scan/Recipes bottom-nav tabs
// into one predictable destination, so "where do I log or plan something"
// always has one answer.
const ACTIONS = [
  {
    href: "/scan",
    icon: "📸",
    title: "Log food",
    desc: "Scan a meal or add it manually",
    primary: true,
  },
  {
    href: "/fitness",
    icon: "💪",
    title: "Today's workout",
    desc: "Pick a muscle group, see the plan, check in",
    primary: true,
  },
  {
    href: "/recipes",
    icon: "📖",
    title: "Recipes",
    desc: "Saved recipes you can log in one tap",
  },
  {
    href: "/discover",
    icon: "🍱",
    title: "Meal ideas",
    desc: "Budget-aware food picks + places to eat",
  },
  {
    href: "/coach",
    icon: "💬",
    title: "Coach",
    desc: "Ask the AI about your plan",
  },
];

export default async function TrainPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Force the split-setup quiz the first time someone opens Train, same
    // as the onboarding gate on Home — everything else here assumes a plan
    // exists (the split label on "Today's workout" comes from it).
    const { data: plan } = await supabase
      .from("training_plans")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!plan) redirect("/train/setup");
  }

  const primary = ACTIONS.filter((a) => a.primary);
  const secondary = ACTIONS.filter((a) => !a.primary);

  return (
    <div className="mx-auto max-w-md px-5 pb-24 pt-8">
      <h1 className="text-2xl font-bold">Train</h1>
      <p className="mt-1 text-sm text-zinc-400">Everything for today&apos;s food and workout.</p>

      <div className="mt-5 space-y-3">
        {primary.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-3.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 active:scale-[0.99]"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-2xl">
              {a.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-100">{a.title}</p>
              <p className="mt-0.5 truncate text-xs text-zinc-500">{a.desc}</p>
            </div>
            <span className="text-zinc-600">›</span>
          </Link>
        ))}
      </div>

      <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Plan &amp; ideas
      </p>
      <div className="space-y-2.5">
        {secondary.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3.5 active:scale-[0.99]"
          >
            <span className="text-xl">{a.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-zinc-200">{a.title}</p>
              <p className="truncate text-xs text-zinc-500">{a.desc}</p>
            </div>
            <span className="text-zinc-600">›</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
