"use client";

import { useEffect, useState } from "react";

/**
 * Small "+N XP ⚡" toast that pops in, holds briefly, then fades — the
 * visible feedback for the "daily spark" (logging food or a workout awards
 * XP immediately, not on some later day). Render once near the top of a
 * page and drive it by changing `xp` (any new non-null value re-triggers
 * the animation, even if the number repeats).
 */
export default function XpSparkToast({ xp, onDone }: { xp: number | null; onDone?: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (xp == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- driving a one-shot show/hide animation off a changing prop
    setVisible(true);
    const hide = setTimeout(() => setVisible(false), 1400);
    const clear = setTimeout(() => onDone?.(), 1700);
    return () => {
      clearTimeout(hide);
      clearTimeout(clear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xp]);

  if (xp == null) return null;

  return (
    <div
      className={`pointer-events-none fixed left-1/2 top-6 z-[60] -translate-x-1/2 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
      }`}
    >
      <div className="lf-glow flex items-center gap-1.5 rounded-full border border-emerald-500/50 bg-zinc-900 px-4 py-2 shadow-lg">
        <span className="text-base">⚡</span>
        <span className="text-sm font-bold text-emerald-400">+{xp} XP</span>
      </div>
    </div>
  );
}
