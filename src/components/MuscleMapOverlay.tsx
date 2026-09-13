"use client";

import { useEffect, useState } from "react";
import { rankMeta, type RankTier } from "@/lib/rank";
import type { MuscleGroup } from "@/lib/trainingSplits";

type Sex = "male" | "female";

interface MaskData {
  width: number;
  height: number;
  muscles: Partial<Record<MuscleGroup, number[][][]>>;
}

const maskCache: Partial<Record<Sex, MaskData>> = {};

// Newbie has no color in rank.ts (null = default text color) — the muscle
// map needs an actual fill for it, so untrained muscles read as a neutral
// grey rather than invisible.
const NEWBIE_COLOR = "#3f3f46";

function colorForTier(tier: RankTier): string {
  return rankMeta(tier).color ?? NEWBIE_COLOR;
}

export default function MuscleMapOverlay({
  sex,
  ranks,
  onSelect,
}: {
  sex: Sex;
  ranks: Partial<Record<MuscleGroup, RankTier>>;
  onSelect?: (muscle: MuscleGroup) => void;
}) {
  // Bumped after a fetch lands so the component re-renders and picks up the
  // newly-cached mask — the mask itself is read straight from maskCache each
  // render rather than mirrored into state, so a cache hit never needs a
  // synchronous setState from inside the effect.
  const [, setLoadTick] = useState(0);
  const mask = maskCache[sex] ?? null;

  useEffect(() => {
    if (maskCache[sex]) return;
    let cancelled = false;
    fetch(`/fitness/masks/${sex}-muscle-masks.json`)
      .then((res) => res.json())
      .then((data: MaskData) => {
        if (cancelled) return;
        maskCache[sex] = data;
        setLoadTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sex]);

  return (
    <div className="lf-gradient-border relative mt-5 overflow-hidden p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sex === "male" ? "/fitness/male-diagram.jpg" : "/fitness/female-diagram.jpg"}
        alt={`${sex === "male" ? "Male" : "Female"} muscle group diagram, front and back, colored by your current rank per muscle`}
        className="w-full rounded-xl object-contain"
      />
      {mask && (
        <svg
          viewBox={`0 0 ${mask.width} ${mask.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="pointer-events-none absolute inset-2 h-[calc(100%-16px)] w-[calc(100%-16px)]"
        >
          {(Object.entries(mask.muscles) as [MuscleGroup, number[][][]][]).map(([muscle, polys]) => {
            const tier = ranks[muscle] ?? "newbie";
            const fill = colorForTier(tier);
            return (
              <g key={muscle} className={onSelect ? "pointer-events-auto" : undefined}>
                {polys.map((poly, i) => (
                  <polygon
                    key={i}
                    points={poly.map((p) => p.join(",")).join(" ")}
                    fill={fill}
                    fillOpacity={0.62}
                    stroke={fill}
                    strokeOpacity={0.85}
                    strokeWidth={2}
                    onClick={onSelect ? () => onSelect(muscle) : undefined}
                    style={onSelect ? { cursor: "pointer" } : undefined}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
