"use client";

import { useRef, useState } from "react";

const TRIGGER_PX = 70;

/**
 * Wraps a page's content and shows a refresh spinner when the user pulls
 * down from the very top — the visual affordance native apps have that a
 * plain scrollable web page doesn't. Only activates when the wrapped
 * content is already scrolled to the top (so it doesn't fight normal
 * scrolling), and calls `onRefresh` once the user releases past the
 * trigger distance.
 */
export default function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (refreshing) return;
    const scrollTop = containerRef.current?.scrollTop ?? window.scrollY;
    if (scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      setDragging(true);
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null || refreshing) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPull(Math.min(delta * 0.5, 100));
  }

  async function onTouchEnd() {
    if (startY.current == null) return;
    startY.current = null;
    setDragging(false);
    if (pull >= TRIGGER_PX * 0.5) {
      setRefreshing(true);
      setPull(TRIGGER_PX * 0.5);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  }

  const showSpinner = pull > 4 || refreshing;

  return (
    <div
      ref={containerRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: dragging ? "none" : "transform 200ms" }}
    >
      <div
        className="pointer-events-none flex items-center justify-center overflow-hidden transition-opacity"
        style={{ height: showSpinner ? 36 : 0, opacity: showSpinner ? 1 : 0 }}
      >
        <div
          className={`h-5 w-5 rounded-full border-2 border-zinc-700 border-t-emerald-400 ${
            refreshing ? "animate-spin" : ""
          }`}
          style={!refreshing ? { transform: `rotate(${pull * 3}deg)` } : undefined}
        />
      </div>
      {children}
    </div>
  );
}
