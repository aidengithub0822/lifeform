"use client";

import { useEffect, useState } from "react";

/**
 * Full-screen splash shown briefly on cold open (standalone iOS PWAs don't
 * get a native launch screen the way native apps do, so we fake one).
 * Also doubles as a real loading state, not just decoration.
 */
export default function Splash() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 900);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-zinc-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/logo-mark.png"
        alt="lifeform"
        className="h-28 w-28 animate-pulse rounded-3xl"
      />
      <p className="lowercase tracking-tight text-lg font-bold text-white">lifeform</p>
    </div>
  );
}
