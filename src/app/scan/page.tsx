"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ScoreBadge from "@/components/ScoreBadge";
import XpSparkToast from "@/components/XpSparkToast";
import { localDateString } from "@/lib/timezone";
import { MEAL_LABEL, MEAL_ORDER, defaultMealNow, insertFoodLog, isMealType, type MealType } from "@/lib/meals";
import type { FoodLog } from "@/lib/types";

interface ScanResult {
  food_name: string;
  description: string;
  estimated_servings_note?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  score: number;
  score_reason: string;
}

type Mode = "photo" | "text" | "recent";

// The date input's own local calendar day — see src/lib/timezone.ts for why
// this must never be a raw toISOString() slice.
function todayLocalStr(): string {
  return localDateString(new Date());
}

// iPhone camera photos can be several MB, and base64-encoding inflates that
// by ~33% — easily enough to blow past the ~4.5MB request body limit on
// Vercel's serverless functions, which then rejects the request before our
// API route ever runs (no JSON body, just a plain error page). Downscaling
// and re-compressing client-side keeps every upload comfortably small while
// staying more than sharp enough for the model to identify food.
function compressImage(file: File): Promise<{ data: string; mediaType: string; previewUrl: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const MAX_DIM = 1280;
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not process image"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      const [header, data] = dataUrl.split(",");
      const mediaType = header.match(/data:(.*);base64/)?.[1] || "image/jpeg";
      URL.revokeObjectURL(objectUrl);
      resolve({ data, mediaType, previewUrl: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image"));
    };
    img.src = objectUrl;
  });
}

// A food the user has logged before, collapsed to its most recent entry —
// the "Recent" tab's rows, like MyFitnessPal's History tab.
interface RecentFood {
  key: string;
  food: FoodLog;
}

function ago(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const SERVING_OPTIONS = [0.5, 1, 1.5, 2];

function ScanInner() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const today = todayLocalStr();
  const paramDate = params.get("date");
  const paramMeal = params.get("meal");

  const [mode, setMode] = useState<Mode>("photo");
  const [meal, setMeal] = useState<MealType>(isMealType(paramMeal) ? paramMeal : defaultMealNow());
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ data: string; mediaType: string } | null>(null);
  const [typedFood, setTypedFood] = useState("");
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sparkXp, setSparkXp] = useState<number | null>(null);
  const [logDate, setLogDate] = useState(paramDate && /^\d{4}-\d{2}-\d{2}$/.test(paramDate) && paramDate <= today ? paramDate : today);
  const isBackdated = logDate !== today;

  const [recents, setRecents] = useState<RecentFood[] | null>(null);
  const [recentQuery, setRecentQuery] = useState("");
  const [servings, setServings] = useState<Record<string, number>>({});
  const [addingKey, setAddingKey] = useState<string | null>(null);

  // Load the "Recent" list the first time that tab is opened: the newest log
  // of each distinct food, most recent first.
  useEffect(() => {
    if (mode !== "recent" || recents !== null) return;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error: loadError } = await supabase
        .from("food_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("logged_at", { ascending: false })
        .limit(400)
        .returns<FoodLog[]>();
      if (loadError) {
        setError(`Couldn't load your recent foods: ${loadError.message}`);
        setRecents([]);
        return;
      }
      const seen = new Set<string>();
      const list: RecentFood[] = [];
      for (const food of data ?? []) {
        const key = food.food_name.trim().toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        list.push({ key, food });
        if (list.length >= 80) break;
      }
      setRecents(list);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, recents]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    try {
      const { data, mediaType, previewUrl } = await compressImage(file);
      setImageData({ data, mediaType });
      setImagePreview(previewUrl);
    } catch {
      setError("Couldn't process that photo — try a different one.");
    }
  }

  async function runScan() {
    if (mode === "photo" && !imageData) return;
    if (mode === "text" && !typedFood.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/scan-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "photo"
            ? { imageBase64: imageData?.data, mediaType: imageData?.mediaType, note }
            : { foodDescription: typedFood }
        ),
      });
      let body: { error?: string } & Partial<ScanResult> = {};
      try {
        body = await res.json();
      } catch {
        setError(
          res.status === 413
            ? "That photo was too large to send — try again, it should auto-compress now."
            : `Scan failed (server error ${res.status}). Try again.`
        );
        return;
      }
      if (!res.ok) {
        setError(body.error || "Scan failed");
        return;
      }
      setResult(body as ScanResult);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setScanning(false);
    }
  }

  // Everything that happens after a log row is written: daily-spark XP (only
  // for entries logged against today) and heading back to the diary on the
  // day that was just logged to.
  async function afterSave() {
    let xpEarned = 0;
    if (!isBackdated) {
      try {
        const sparkRes = await fetch("/api/streak/spark", { method: "POST" });
        if (sparkRes.ok) {
          const spark = await sparkRes.json();
          xpEarned = spark.xpEarned;
        }
      } catch {
        // Spark XP is a nice-to-have — never block navigation on it failing.
      }
    }
    const dest = isBackdated ? `/?date=${logDate}` : "/";
    const go = () => {
      router.push(dest);
      router.refresh();
    };
    if (xpEarned > 0) {
      setSparkXp(xpEarned);
      setTimeout(go, 900);
    } else {
      go();
    }
  }

  // A backdated entry gets a timestamp inside its chosen day (noon, to stay
  // clear of either UTC-day edge) instead of "now", and is flagged so it never
  // earns streak/XP credit — see counts_for_streak on the food_logs table.
  function loggedAtIso(): string {
    return isBackdated ? new Date(`${logDate}T12:00:00`).toISOString() : new Date().toISOString();
  }

  async function saveLog() {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not signed in — sign in again and retry.");
        return;
      }

      // The photo is a bonus: if the upload fails the meal is still logged.
      let photoUrl: string | null = null;
      if (imagePreview) {
        try {
          const blob = await (await fetch(imagePreview)).blob();
          const path = `${user.id}/${Date.now()}.jpg`;
          const { error: uploadError } = await supabase.storage.from("food-photos").upload(path, blob, {
            contentType: imageData?.mediaType || "image/jpeg",
          });
          if (!uploadError) {
            photoUrl = supabase.storage.from("food-photos").getPublicUrl(path).data.publicUrl;
          }
        } catch {
          // fall through without a photo
        }
      }

      const { error: insertError } = await insertFoodLog(supabase, {
        user_id: user.id,
        photo_url: photoUrl,
        food_name: result.food_name,
        description: result.description,
        serving_note: result.estimated_servings_note ?? null,
        calories: Math.max(0, Math.round(Number(result.calories) || 0)),
        protein_g: Number(result.protein_g) || 0,
        carbs_g: Number(result.carbs_g) || 0,
        fat_g: Number(result.fat_g) || 0,
        score: Math.min(100, Math.max(0, Math.round(Number(result.score) || 0))),
        score_reason: result.score_reason ?? "",
        source: "scan",
        meal,
        logged_at: loggedAtIso(),
        counts_for_streak: !isBackdated,
      });
      if (insertError) {
        setError(`Couldn't save that: ${insertError.message}`);
        return;
      }
      await afterSave();
    } catch (e) {
      setError(`Couldn't save that: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  // One-tap re-log of a food from the Recent tab (no AI call): copies the old
  // entry's nutrition, scaled by the chosen serving multiplier.
  async function quickAdd(entry: RecentFood) {
    const mult = servings[entry.key] ?? 1;
    setAddingKey(entry.key);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not signed in — sign in again and retry.");
        return;
      }
      const f = entry.food;
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const { error: insertError } = await insertFoodLog(supabase, {
        user_id: user.id,
        photo_url: f.photo_url,
        food_name: f.food_name,
        description: f.description,
        serving_note: mult === 1 ? f.serving_note : `${mult}× of a previous portion${f.serving_note ? ` (${f.serving_note})` : ""}`,
        calories: Math.max(0, Math.round(f.calories * mult)),
        protein_g: round1(Number(f.protein_g) * mult),
        carbs_g: round1(Number(f.carbs_g) * mult),
        fat_g: round1(Number(f.fat_g) * mult),
        score: f.score,
        score_reason: f.score_reason,
        source: "manual",
        meal,
        logged_at: loggedAtIso(),
        counts_for_streak: !isBackdated,
      });
      if (insertError) {
        setError(`Couldn't save that: ${insertError.message}`);
        return;
      }
      await afterSave();
    } catch (e) {
      setError(`Couldn't save that: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setAddingKey(null);
    }
  }

  function reset() {
    setImagePreview(null);
    setImageData(null);
    setTypedFood("");
    setResult(null);
    setNote("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function switchMode(next: Mode) {
    if (next === mode) return;
    reset();
    setMode(next);
  }

  const filteredRecents = (recents ?? []).filter((r) =>
    recentQuery.trim() ? r.food.food_name.toLowerCase().includes(recentQuery.trim().toLowerCase()) : true
  );

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <XpSparkToast xp={sparkXp} onDone={() => setSparkXp(null)} />
      <h1 className="text-2xl font-bold">Log food</h1>
      <p className="mt-1 text-sm text-zinc-400">Snap a photo, type what you ate, or re-add something recent.</p>

      <div className="mt-5">
        <p className="text-xs font-medium text-zinc-400">Add to</p>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {MEAL_ORDER.map((m) => (
            <button
              key={m}
              onClick={() => setMeal(m)}
              className={`rounded-lg py-2 text-xs font-semibold ${
                meal === m ? "bg-emerald-500 text-black" : "bg-zinc-900 text-zinc-300"
              }`}
            >
              {MEAL_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex gap-1 rounded-full bg-zinc-900 p-1">
        {(
          [
            ["photo", "📸 Photo"],
            ["text", "⌨️ Type it"],
            ["recent", "🕘 Recent"],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`flex-1 rounded-full py-2 text-sm font-semibold ${
              mode === m ? "bg-emerald-500 text-black" : "text-zinc-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
        <div>
          <label htmlFor="log-date" className="block text-xs font-medium text-zinc-400">
            Log for
          </label>
          <p className="mt-0.5 text-sm font-semibold">
            {isBackdated ? new Date(`${logDate}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "Today"}
          </p>
        </div>
        <input
          id="log-date"
          type="date"
          value={logDate}
          max={today}
          onChange={(e) => setLogDate(e.target.value || today)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-sm text-zinc-200 outline-none focus:border-emerald-500"
        />
      </div>
      {isBackdated && (
        <p className="mt-2 text-xs text-zinc-500">
          Backdated entries show up on that day&apos;s log but won&apos;t earn XP or count toward your streak.
        </p>
      )}

      {mode === "photo" && !imagePreview && (
        <div className="mt-6 flex aspect-square flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed border-zinc-700 text-zinc-400">
          <span className="text-5xl">📸</span>

          {/* `capture` here keeps the camera embedded inside the app on iOS
              (no full app-switch to Camera.app, so you never get bounced out
              to the home screen). A separate control without `capture` is
              used for the library so that one still shows the normal Photos
              picker sheet. */}
          <label className="cursor-pointer rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-black active:opacity-80">
            Take a photo
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>

          <label className="cursor-pointer text-sm font-medium text-zinc-300 underline underline-offset-4 active:opacity-70">
            Choose from library
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {mode === "text" && !result && (
        <div className="mt-6 space-y-3">
          <textarea
            value={typedFood}
            onChange={(e) => setTypedFood(e.target.value)}
            placeholder={"What did you eat? e.g. \"2 scoops whey protein with oat milk and a banana\""}
            rows={4}
            className="w-full rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm placeholder-zinc-500 outline-none focus:border-emerald-500"
          />
          <button
            onClick={runScan}
            disabled={scanning || !typedFood.trim()}
            className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-black disabled:opacity-60"
          >
            {scanning ? "Estimating..." : "Estimate nutrition"}
          </button>
        </div>
      )}

      {mode === "photo" && imagePreview && (
        <div className="mt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imagePreview} alt="Food to scan" className="w-full rounded-2xl object-cover" />

          {!result && (
            <>
              <input
                type="text"
                placeholder="Optional note (e.g. 'large plate, extra cheese')"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm placeholder-zinc-500 outline-none focus:border-emerald-500"
              />
              <div className="mt-4 flex gap-3">
                <button
                  onClick={reset}
                  className="flex-1 rounded-xl bg-zinc-800 py-3 font-medium text-zinc-300"
                >
                  Retake
                </button>
                <button
                  onClick={runScan}
                  disabled={scanning}
                  className="flex-[2] rounded-xl bg-emerald-500 py-3 font-semibold text-black disabled:opacity-60"
                >
                  {scanning ? "Scanning..." : "Scan"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {mode === "recent" && (
        <div className="mt-5">
          <input
            type="search"
            value={recentQuery}
            onChange={(e) => setRecentQuery(e.target.value)}
            placeholder="Search your recent foods"
            className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-emerald-500"
          />
          {recents === null && <p className="mt-6 text-sm text-zinc-500">Loading...</p>}
          {recents !== null && recents.length === 0 && (
            <p className="mt-6 text-center text-sm text-zinc-500">
              Nothing here yet — foods you log will show up here, newest first, so you can re-add them in one tap.
            </p>
          )}
          {recents !== null && recents.length > 0 && filteredRecents.length === 0 && (
            <p className="mt-6 text-center text-sm text-zinc-500">No recent foods match that.</p>
          )}
          <div className="mt-2">
            {filteredRecents.map((r) => {
              const mult = servings[r.key] ?? 1;
              return (
                <div key={r.key} className="flex items-center gap-3 border-b border-zinc-900 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-100">{r.food.food_name}</p>
                    <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                      {Math.round(r.food.calories * mult)} cal · {Math.round(Number(r.food.protein_g) * mult)}g protein ·{" "}
                      {ago(r.food.logged_at)}
                    </p>
                  </div>
                  <select
                    value={mult}
                    onChange={(e) => setServings((prev) => ({ ...prev, [r.key]: Number(e.target.value) }))}
                    aria-label="Servings"
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-300"
                  >
                    {SERVING_OPTIONS.map((o) => (
                      <option key={o} value={o}>
                        {o}×
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => quickAdd(r)}
                    disabled={addingKey !== null}
                    aria-label={`Add ${r.food.food_name} to ${MEAL_LABEL[meal]}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-lg font-bold leading-none text-black disabled:opacity-50"
                  >
                    {addingKey === r.key ? "…" : "+"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-4">
          <div className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <ScoreBadge score={result.score} size="lg" />
            <div>
              <p className="font-semibold">{result.food_name}</p>
              <p className="text-sm text-zinc-400">{result.calories} calories</p>
            </div>
          </div>

          <p className="text-sm text-zinc-300">{result.score_reason}</p>
          {result.estimated_servings_note && (
            <p className="text-xs text-zinc-500">Assumption: {result.estimated_servings_note}</p>
          )}

          <div className="grid grid-cols-3 gap-3 text-center">
            <Macro label="Protein" value={result.protein_g} />
            <Macro label="Carbs" value={result.carbs_g} />
            <Macro label="Fat" value={result.fat_g} />
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 rounded-xl bg-zinc-800 py-3 font-medium text-zinc-300"
            >
              Discard
            </button>
            <button
              onClick={saveLog}
              disabled={saving}
              className="flex-[2] rounded-xl bg-emerald-500 py-3 font-semibold text-black disabled:opacity-60"
            >
              {saving ? "Saving..." : `Log to ${MEAL_LABEL[meal]}`}
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}

// useSearchParams needs a Suspense boundary for the page to build statically.
export default function ScanPage() {
  return (
    <Suspense fallback={null}>
      <ScanInner />
    </Suspense>
  );
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-zinc-900 py-3">
      <p className="text-lg font-bold">{Math.round(value)}g</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  );
}
