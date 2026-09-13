export default function VerifiedBadge({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      className="shrink-0"
      aria-label="Verified"
      role="img"
    >
      <path
        d="M11 0l2.2 1.6 2.7-.4 1.2 2.4 2.4 1.2-.4 2.7L20.7 10l-1.6 2.2.4 2.7-2.4 1.2-1.2 2.4-2.7-.4L11 20l-2.2-1.6-2.7.4-1.2-2.4-2.4-1.2.4-2.7L.3 10l1.6-2.2-.4-2.7 2.4-1.2 1.2-2.4 2.7.4L11 0z"
        fill="#3b82f6"
      />
      <path
        d="M6.5 10.8l2.8 2.8 6-6.2"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
