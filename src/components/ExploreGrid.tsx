import Link from "next/link";

const items = [
  {
    href: "/discover",
    icon: "🍱",
    title: "Discover",
    desc: "Budget food picks + places to eat",
  },
  {
    href: "/coach",
    icon: "💬",
    title: "Coach",
    desc: "Ask the AI about your plan",
  },
  {
    href: "/fitness",
    icon: "💪",
    title: "Fitness",
    desc: "Workouts by muscle group",
  },
  {
    href: "/community",
    icon: "🌐",
    title: "Community",
    desc: "AI-moderated discussion",
  },
  {
    href: "/messages",
    icon: "✉️",
    title: "Messages",
    desc: "Direct message other users",
  },
];

export default function ExploreGrid() {
  return (
    <div className="mt-6">
      <p className="mb-3 text-sm font-semibold text-zinc-300">More to explore</p>
      <div className="grid grid-cols-2 gap-2.5">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="lf-gradient-border flex flex-col items-center gap-1 px-2 py-4 text-center active:scale-[0.97]"
          >
            <span className="text-2xl">{item.icon}</span>
            <span className="text-xs font-semibold text-zinc-200">{item.title}</span>
            <span className="text-[10px] leading-tight text-zinc-500">{item.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
