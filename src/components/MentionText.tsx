import Link from "next/link";
import type { ReactNode } from "react";
import { MENTION_RE } from "@/lib/mentions";

export { extractMentions } from "@/lib/mentions";

/** Renders text with @username tokens turned into links to that profile. */
export default function MentionText({ text, className }: { text: string; className?: string }) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE);
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1].toLowerCase() === "everyone") {
      parts.push(
        <span key={key++} className="rounded bg-amber-400/15 px-1 font-semibold text-amber-300">
          @everyone
        </span>
      );
      lastIndex = match.index + match[0].length;
      continue;
    }
    parts.push(
      <Link key={key++} href={`/profile/${match[1]}`} className="font-semibold text-emerald-400" onClick={(e) => e.stopPropagation()}>
        @{match[1]}
      </Link>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return <p className={className}>{parts}</p>;
}
