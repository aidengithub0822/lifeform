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
  CartesianGrid,
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
      <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-500">
        Log a few days of food and your weekly trends will show up here.
      </div>
    );
  }

  const chartData = days.map((d) => ({
    ...d,
    label: new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short" }),
  }));

  return (
    <div className="mt-6 space-y-4">
      <p className="text-sm font-semibold text-zinc-300">This week</p>

      <div className="lf-gradient-border p-4">
        <p className="mb-2 text-xs font-medium text-zinc-400">Calories vs. target</p>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, "dataMax + 300"]} />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Line
                type="monotone"
                dataKey="calories"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ r: 3, fill: "#10b981" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] text-zinc-600">Target: {calorieTarget}/day</p>
      </div>

      <div className="lf-gradient-border p-4">
        <p className="mb-2 text-xs font-medium text-zinc-400">Protein per day (g)</p>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: "#18181b", border: "1px solid #3f3f46", fontSize: 12 }}
                labelStyle={{ color: "#a1a1aa" }}
              />
              <Bar dataKey="protein" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
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
        <MiniStat
          label="Days logged"
          value={`${days.filter((d) => d.calories > 0).length}/7`}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-center">
      <p className="text-xl font-bold text-emerald-400">{value}</p>
      <p className="text-[11px] text-zinc-500">{label}</p>
    </div>
  );
}
