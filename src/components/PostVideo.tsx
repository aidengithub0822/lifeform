// Inline video for a community post. Kept OUTSIDE the double-tap-to-like
// wrapper on purpose so the native play/scrub controls still work.
export default function PostVideo({ src, className }: { src: string; className?: string }) {
  return (
    <video
      src={src}
      controls
      playsInline
      preload="metadata"
      className={`w-full rounded-2xl bg-black ${className ?? "mt-2.5 max-h-96"}`}
    />
  );
}
