"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";

export interface DayTotal {
  date: string;
  calories: number;
  protein: number;
  avgScore: number | null;
}

const EMERALD = "#10b981";
const EMERALD_SOFT = "rgba(16, 185, 129, 0.35)";

/** Respects the OS/browser "reduce motion" setting — Recharts' built-in animation is driven in JS, not CSS, so a `prefers-reduced-motion` media query alone can't turn it off; this checks it directly. */
function prefersReducedMotionNow(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function usePrefersReducedMotion(): boolean {
  // Lazy initializer reads the real value on first render instead of
  // defaulting to false and flipping it via setState inside an effect.
  const [reduced, setReduced] = useState(prefersReducedMotionNow);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function WeeklyTrends({ days, calorieTarget }: { days: DayTotal[]; calorieTarget: number }) {
  const hasData = days.some((d) => d.calories > 0);
  const reducedMotion = usePrefersReducedMotion();

  if (!hasData) {
    return (
      <div className="mt-7 rounded-2xl border border-dashed border-[#27272a] py-8 text-center text-sm text-[#71717a]">
        Log a few days of food and your weekly trends will show up here.
      </div>
    );
  }

  const chartData = days.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }),
  }));

  return (
    <div className="lf-chart-rise mt-7">
      <p className="text-sm font-semibold text-[#e4e4e7]">This week</p>

      <div className="mt-3">
        <p className="text-xs font-medium text-[#71717a]">Calories vs. target</p>
        <div className="mt-1 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="lfCaloriesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EMERALD} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={EMERALD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, "dataMax + 300"]} />
              <ReferenceLine y={calorieTarget} stroke="#52525b" strokeDasharray="4 4" strokeWidth={1} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12, borderRadius: 8 }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Area
                type="monotone"
                dataKey="calories"
                stroke={EMERALD}
                strokeWidth={2.5}
                fill="url(#lfCaloriesFill)"
                dot={{ r: 2.5, fill: EMERALD, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: EMERALD, stroke: "#09090b", strokeWidth: 2 }}
                isAnimationActive={!reducedMotion}
                animationDuration={900}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-[#52525b]">Target: {calorieTarget}/day</p>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-[#71717a]">Protein per day (g)</p>
        <div className="mt-1 h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="lfProteinFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={EMERALD} stopOpacity={1} />
                  <stop offset="100%" stopColor={EMERALD} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12, borderRadius: 8 }}
                labelStyle={{ color: "#a1a1aa" }}
                cursor={{ fill: EMERALD_SOFT, opacity: 0.08 }}
              />
              <Bar
                dataKey="protein"
                fill="url(#lfProteinFill)"
                radius={[4, 4, 0, 0]}
                isAnimationActive={!reducedMotion}
                animationDuration={700}
                animationEasing="ease-out"
              >
                {chartData.map((_, i) => (
                  // Staggering each bar's start gives a left-to-right "build"
                  // instead of every bar growing in sync.
                  <Cell key={i} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 flex divide-x divide-[#1a1a1d]">
        <MiniStat
          label="Avg. food score"
          value={
            days.some((d) => d.avgScore != null)
              ? Math.round(
                  days.filter((d) => d.avgScore != null).reduce((a, d) => a + (d.avgScore ?? 0), 0) /
                    days.filter((d) => d.avgScore != null).length
                ).toString()
              : "—"
          }
        />
        <MiniStat label="Days logged" value={`${days.filter((d) => d.calories > 0).length}/7`} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 text-center first:pl-0 first:pr-4 last:pl-4">
      <p className="text-xl font-bold tabular-nums text-[#fafafa]">{value}</p>
      <p className="text-[11px] text-[#71717a]">{label}</p>
    </div>
  );
}
