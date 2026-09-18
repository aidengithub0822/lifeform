"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ScoreBadge from "@/components/ScoreBadge";
import XpSparkToast from "@/components/XpSparkToast";
import { localDateString } from "@/lib/timezone";

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

type Mode = "photo" | "text";

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

export default function ScanPage() {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("photo");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ data: string; mediaType: string } | null>(null);
  const [typedFood, setTypedFood] = useState("");
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sparkXp, setSparkXp] = useState<number | null>(null);
  const today = todayLocalStr();
  const [logDate, setLogDate] = useState(today);
  const isBackdated = logDate !== today;

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

  async function saveLog() {
    if (!result) return;
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in");
      setSaving(false);
      return;
    }

    let photoUrl: string | null = null;
    if (imagePreview) {
      const blob = await (await fetch(imagePreview)).blob();
      const path = `${user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("food-photos").upload(path, blob, {
        contentType: imageData?.mediaType || "image/jpeg",
      });
      if (!uploadError) {
        photoUrl = supabase.storage.from("food-photos").getPublicUrl(path).data.publicUrl;
      }
    }

    // A backdated entry gets a timestamp inside its chosen day (noon, to
    // stay clear of either UTC-day edge) instead of "now", and is flagged
    // so it never earns streak/XP credit — see counts_for_streak on the
    // food_logs table.
    const loggedAt = isBackdated ? new Date(`${logDate}T12:00:00`).toISOString() : new Date().toISOString();

    const { error } = await supabase.from("food_logs").insert({
      user_id: user.id,
      photo_url: photoUrl,
      food_name: result.food_name,
      description: result.description,
      serving_note: result.estimated_servings_note ?? null,
      calories: Math.round(result.calories),
      protein_g: result.protein_g,
      carbs_g: result.carbs_g,
      fat_g: result.fat_g,
      score: Math.round(result.score),
      score_reason: result.score_reason,
      source: "scan",
      logged_at: loggedAt,
      counts_for_streak: !isBackdated,
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }

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

    if (xpEarned > 0) {
      setSparkXp(xpEarned);
      setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 900);
    } else {
      router.push("/");
      router.refresh();
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

  const hasInput = mode === "photo" ? !!imagePreview : !!result || scanning;

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <XpSparkToast xp={sparkXp} onDone={() => setSparkXp(null)} />
      <h1 className="text-2xl font-bold">Log food</h1>
      <p className="mt-1 text-sm text-zinc-400">Snap a photo, or just type what you ate.</p>

      <div className="mt-5 flex gap-1 rounded-full bg-zinc-900 p-1">
        <button
          onClick={() => switchMode("photo")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${
            mode === "photo" ? "bg-emerald-500 text-black" : "text-zinc-400"
          }`}
        >
          📸 Photo
        </button>
        <button
          onClick={() => switchMode("text")}
          className={`flex-1 rounded-full py-2 text-sm font-semibold ${
            mode === "text" ? "bg-emerald-500 text-black" : "text-zinc-400"
          }`}
        >
          ⌨️ Type it
        </button>
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
          {error && <p className="text-sm text-red-400">{error}</p>}
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
              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            </>
          )}
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

          {error && <p className="text-sm text-red-400">{error}</p>}

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
              {saving ? "Saving..." : "Log it"}
            </button>
          </div>
        </div>
      )}

      {!hasInput && error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
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
