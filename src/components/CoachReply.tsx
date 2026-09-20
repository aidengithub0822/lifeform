import type { ReactNode } from "react";

// Renders Coach's reply so it's easy to read on a phone: blank-line
// separated paragraphs with real spacing between them, bullet/numbered lists
// as lists, **bold** as bold — and if the model hands back one long
// unbroken paragraph anyway, it gets split into short chunks of two
// sentences each.

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-zinc-50">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    )
  );
}

// Splits a long single-paragraph blob into paragraphs of ~2 sentences.
function chunkSentences(text: string): string[] {
  const pieces = text.split(/([.!?]["')\]]?)\s+(?=[A-Z0-9])/);
  const sentences: string[] = [];
  for (let i = 0; i < pieces.length; i += 2) sentences.push((pieces[i] ?? "") + (pieces[i + 1] ?? ""));
  if (sentences.length < 4) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) chunks.push(sentences.slice(i, i + 2).join(" "));
  return chunks;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+/;

export default function CoachReply({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  const out: ReactNode[] = [];

  blocks.forEach((block, bi) => {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length === 0) return;

    // A block may start with a lead-in line and then bullets.
    const firstBullet = lines.findIndex((l) => BULLET.test(l));
    if (firstBullet !== -1 && lines.slice(firstBullet).every((l) => BULLET.test(l))) {
      const lead = lines.slice(0, firstBullet).join(" ");
      const items = lines.slice(firstBullet);
      const ordered = /^\s*\d+[.)]\s+/.test(items[0]);
      const ListTag = ordered ? "ol" : "ul";
      if (lead) {
        out.push(
          <p key={`${bi}-lead`} className="leading-relaxed">
            {inline(lead)}
          </p>
        );
      }
      out.push(
        <ListTag key={`${bi}-list`} className={`space-y-1.5 pl-5 leading-relaxed ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((l, li) => (
            <li key={li}>{inline(l.replace(BULLET, ""))}</li>
          ))}
        </ListTag>
      );
      return;
    }

    const paragraph = lines.join("\n");
    const chunks = lines.length === 1 ? chunkSentences(paragraph) : [paragraph];
    chunks.forEach((c, ci) =>
      out.push(
        <p key={`${bi}-${ci}`} className="whitespace-pre-line leading-relaxed">
          {inline(c.replace(/^#{1,4}\s+/, ""))}
        </p>
      )
    );
  });

  return <div className="space-y-3">{out}</div>;
}
