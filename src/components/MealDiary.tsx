"use client";

import Link from "next/link";
import FoodLogItem from "@/components/FoodLogItem";
import { MEAL_LABEL, MEAL_ORDER, mealOfLog, type MealType } from "@/lib/meals";
import type { FoodLog } from "@/lib/types";

// MyFitnessPal-style food diary: one section per meal with its calorie
// subtotal and its own "+ Add food" button, newest entry first within each.
export default function MealDiary({
  logs,
  timezone,
  dateStr,
  isToday,
}: {
  logs: FoodLog[];
  timezone: string;
  dateStr: string;
  isToday: boolean;
}) {
  const byMeal = new Map<MealType, FoodLog[]>(MEAL_ORDER.map((m) => [m, []]));
  for (const log of logs) byMeal.get(mealOfLog(log, timezone))!.push(log);
  for (const list of byMeal.values()) {
    list.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime());
  }

  return (
    <div className="mt-2 space-y-5">
      {MEAL_ORDER.map((m) => {
        const list = byMeal.get(m)!;
        const total = list.reduce((sum, l) => sum + l.calories, 0);
        const addHref = `/scan?meal=${m}${isToday ? "" : `&date=${dateStr}`}`;
        return (
          <section key={m}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-[#e4e4e7]">{MEAL_LABEL[m]}</h3>
              <span className="text-xs tabular-nums text-[#71717a]">{total} cal</span>
            </div>
            <div className="mt-1">
              {list.map((log) => (
                <FoodLogItem key={log.id} log={log} timezone={timezone} />
              ))}
              <Link
                href={addHref}
                className="mt-1 inline-block py-2 text-sm font-semibold text-emerald-400 active:opacity-70"
              >
                + Add food
              </Link>
            </div>
          </section>
        );
      })}
    </div>
  );
}
