import VerifiedBadge from "@/components/VerifiedBadge";
import { RESERVED_DEV_COLOR } from "@/lib/nameColor";

/** A username with its developer-mode cosmetics applied — custom color
 * (or the reserved dev-only gradient) and a verified checkmark. Used
 * anywhere a username renders: community, profile header, messages. */
export default function UserName({
  username,
  color,
  verified,
  className,
}: {
  username: string;
  color?: string | null;
  verified?: boolean;
  className?: string;
}) {
  const isDevGradient = color === RESERVED_DEV_COLOR;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className ?? ""}`}>
      <span
        className={`truncate ${isDevGradient ? "lf-dev-name" : ""}`}
        style={!isDevGradient && color ? { color } : undefined}
      >
        {username}
      </span>
      {verified && <VerifiedBadge />}
    </span>
  );
}
