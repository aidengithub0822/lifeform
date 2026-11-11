"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CloseIcon } from "@/components/icons";

// Shared bottom-sheet shell used by Settings (HeaderMenu) and the streak
// panel (Flame) — handles the backdrop, a generous drag-to-dismiss zone up
// top (not just the thin pill), and a guaranteed close (X) button in the
// corner for anyone whose drag gesture doesn't register. Each caller keeps
// its own internal layout (tabs, scroll area, padding) as `children`.
const DISMISS_DRAG_PX = 90;

export default function BottomSheet({
  open,
  onClose,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);

  if (!open) return null;

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    draggingRef.current = true;
    setDragging(true);
    startYRef.current = e.clientY;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const delta = e.clientY - startYRef.current;
    setDragY(Math.max(0, delta));
  }

  function endDrag() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    setDragY((current) => {
      if (current > DISMISS_DRAG_PX) onClose();
      return 0;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s ease-out",
        }}
        className={`relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-zinc-800 bg-zinc-950 ${className}`}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className="relative flex h-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
        >
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-1 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-300 active:scale-95"
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
