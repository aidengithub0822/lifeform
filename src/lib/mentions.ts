export const MENTION_RE = /@([a-zA-Z0-9_]{1,32})/g;

/** Distinct @usernames mentioned in a body of text, for notifying taggees. */
export function extractMentions(text: string): string[] {
  const set = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_RE);
  while ((match = re.exec(text)) !== null) set.add(match[1]);
  return [...set];
}
