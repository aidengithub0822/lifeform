// Shared circular avatar — image if the user has one, initial-letter
// fallback otherwise. `ring` wraps it in the rotating gradient ring used
// on the profile page (same visual language as .lf-gradient-border).
export default function Avatar({
  url,
  name,
  size = 36,
  ring = false,
}: {
  url?: string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const img = (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="font-bold text-zinc-600" style={{ fontSize: size * 0.4 }}>
          {(name || "?").slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );

  if (!ring) return img;

  return (
    <div className="lf-avatar-ring inline-flex shrink-0">
      <div className="rounded-full bg-zinc-950 p-[3px]">{img}</div>
    </div>
  );
}
