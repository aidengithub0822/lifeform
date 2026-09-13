import Link from "next/link";

/**
 * Renders a username as a link to that person's profile page when a
 * username exists, or plain text otherwise (older accounts / accounts
 * that haven't set one yet can't be routed to by username).
 */
export default function UserLink({
  username,
  fallback,
  className,
}: {
  username: string | null | undefined;
  fallback: string;
  className?: string;
}) {
  if (!username) return <span className={className}>{fallback}</span>;
  return (
    <Link href={`/profile/${encodeURIComponent(username)}`} className={className ?? "hover:underline"}>
      {username}
    </Link>
  );
}
