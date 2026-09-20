"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HeartIcon } from "@/components/icons";

// Instagram/TikTok-style "double-tap to like". Wrap a post's body or photo;
// two quick taps (or a double-click) fire `onLike` and pop a heart where you
// tapped. Like those apps it only ever LIKES — the caller should ignore the
// call when the post is already liked, never unlike. A single tap still
// works: `onSingleTap` fires after a short wait to make sure a second tap
// isn't coming, so "tap to open the post" and "double-tap to like" can coexist.
// Taps that land on a link/button inside (e.g. an @mention) are left alone.
const DOUBLE_TAP_MS = 300;

export default function DoubleTapLike({
  onLike,
  onSingleTap,
  disabled,
  className,
  children,
}: {
  onLike: () => void;
  onSingleTap?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const singleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(
    () => () => {
      if (singleTimer.current) clearTimeout(singleTimer.current);
    },
    []
  );

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a, button, input, textarea, select, video")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const now = Date.now();
    const prev = lastTap.current;

    if (prev && now - prev.t < DOUBLE_TAP_MS && Math.hypot(x - prev.x, y - prev.y) < 80) {
      lastTap.current = null;
      if (singleTimer.current) {
        clearTimeout(singleTimer.current);
        singleTimer.current = null;
      }
      if (disabled) return;
      onLike();
      const id = nextId.current++;
      setBursts((b) => [...b, { id, x, y }]);
      setTimeout(() => setBursts((b) => b.filter((i) => i.id !== id)), 850);
      return;
    }

    lastTap.current = { t: now, x, y };
    if (onSingleTap) {
      if (singleTimer.current) clearTimeout(singleTimer.current);
      singleTimer.current = setTimeout(() => {
        singleTimer.current = null;
        onSingleTap();
      }, DOUBLE_TAP_MS);
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`relative ${onSingleTap ? "cursor-pointer" : ""} ${className ?? ""}`}
      style={{ touchAction: "manipulation" }}
    >
      {children}
      {bursts.map((b) => (
        <span
          key={b.id}
          aria-hidden
          className="pointer-events-none absolute z-10 text-red-500"
          style={{
            left: b.x - 44,
            top: b.y - 44,
            width: 88,
            height: 88,
            animation: "lf-heart-pop 0.85s ease-out forwards",
            filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.45))",
          }}
        >
          <HeartIcon className="h-full w-full" filled />
        </span>
      ))}
      <style>{`@keyframes lf-heart-pop {
        0% { transform: scale(0.3) rotate(-10deg); opacity: 0; }
        18% { transform: scale(1.15) rotate(4deg); opacity: 1; }
        35% { transform: scale(0.95) rotate(0deg); }
        70% { transform: scale(1) translateY(-6px); opacity: 1; }
        100% { transform: scale(1.25) translateY(-30px); opacity: 0; }
      }`}</style>
    </div>
  );
}
