"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

export interface DayTotal {
  date: string;
  calories: number;
  protein: number;
  avgScore: number | null;
}

export default function WeeklyTrends({ days, calorieTarget }: { days: DayTotal[]; calorieTarget: number }) {
  const hasData = days.some((d) => d.calories > 0);

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
    <div className="mt-7">
      <p className="text-sm font-semibold text-[#e4e4e7]">This week</p>

      <div className="mt-3">
        <p className="text-xs font-medium text-[#71717a]">Calories vs. target</p>
        <div className="mt-1 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, "dataMax + 300"]} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12, borderRadius: 8 }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Line type="monotone" dataKey="calories" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-[#52525b]">Target: {calorieTarget}/day</p>
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-[#71717a]">Protein per day (g)</p>
        <div className="mt-1 h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #27272a", fontSize: 12, borderRadius: 8 }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Bar dataKey="protein" fill="#10b981" radius={[3, 3, 0, 0]} />
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
