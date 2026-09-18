"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import FoodLogItem from "@/components/FoodLogItem";
import { localDateString } from "@/lib/timezone";
import type { FoodLog } from "@/lib/types";

// Home's "Today" list only ever shows literal today — a backdated entry
// (see the date picker on /scan) deliberately lives on its own past day,
// so it never appears there. This is the one place to see (and delete)
// every logged meal, most recent first, grouped by the day it's logged
// against — which is also how a mis-dated entry from before backdating
// existed gets found and cleaned up.
export default function FoodHistoryPage() {
  const supabase = createClient();
  const [logs, setLogs] = useState<FoodLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("food_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("logged_at", { ascending: false })
        .limit(200)
        .returns<FoodLog[]>();
      if (error) {
        setError(error.message);
        return;
      }
      setLogs(data ?? []);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = new Map<string, FoodLog[]>();
  for (const log of logs ?? []) {
    // Local calendar day, not a UTC slice of the stored instant — see
    // src/lib/timezone.ts. This runs in the browser, so no explicit
    // timezone is needed; Intl already defaults to the device's own.
    const day = localDateString(new Date(log.logged_at));
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(log);
  }

  return (
    <div className="mx-auto max-w-md px-5 pb-10 pt-8">
      <Link href="/" className="text-sm font-medium text-emerald-400">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Food log history</h1>
      <p className="mt-1 text-sm text-zinc-400">Every meal you&apos;ve logged, most recent first.</p>

      {error && <p className="mt-6 text-sm text-red-400">Couldn&apos;t load history: {error}</p>}
      {!error && logs === null && <p className="mt-6 text-sm text-zinc-500">Loading...</p>}
      {!error && logs?.length === 0 && (
        <p className="mt-6 text-sm text-zinc-500">Nothing logged yet.</p>
      )}

      <div className="mt-5 space-y-6">
        {[...groups.entries()].map(([day, dayLogs]) => (
          <div key={day}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
              {!dayLogs[0].counts_for_streak && (
                <span className="ml-2 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-medium normal-case text-zinc-400">
                  backdated
                </span>
              )}
            </p>
            <div className="space-y-2.5">
              {dayLogs.map((log) => (
                <FoodLogItem
                  key={log.id}
                  id={log.id}
                  foodName={log.food_name}
                  calories={log.calories}
                  proteinG={log.protein_g}
                  score={log.score}
                  onDeleted={(id) => setLogs((prev) => prev?.filter((l) => l.id !== id) ?? prev)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
