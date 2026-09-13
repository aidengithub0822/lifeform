import VerifiedBadge from "@/components/VerifiedBadge";
import { RESERVED_DEV_COLOR } from "@/lib/nameColor";
import { rankMeta } from "@/lib/rank";

/** A username with its cosmetics applied — a developer-assigned custom
 * color (or the reserved dev-only gradient) always wins; otherwise an
 * earned rank tier colors the name automatically. Plus a verified
 * checkmark. Used anywhere a username renders: community, profile header,
 * messages. */
export default function UserName({
  username,
  color,
  verified,
  rank,
  className,
}: {
  username: string;
  color?: string | null;
  verified?: boolean;
  rank?: string | null;
  className?: string;
}) {
  const isDevGradient = color === RESERVED_DEV_COLOR;
  const effectiveColor = color ?? rankMeta(rank).color;
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className ?? ""}`}>
      <span
        className={`truncate ${isDevGradient ? "lf-dev-name" : ""}`}
        style={!isDevGradient && effectiveColor ? { color: effectiveColor } : undefined}
      >
        {username}
      </span>
      {verified && <VerifiedBadge />}
    </span>
  );
}
