"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ScoreBadge from "@/components/ScoreBadge";

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

function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, data] = result.split(",");
      const mediaType = header.match(/data:(.*);base64/)?.[1] || file.type;
      resolve({ data, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ScanPage() {
  const router = useRouter();
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ data: string; mediaType: string } | null>(null);
  const [note, setNote] = useState("");
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    const encoded = await fileToBase64(file);
    setImageData(encoded);
    setImagePreview(URL.createObjectURL(file));
  }

  async function runScan() {
    if (!imageData) return;
    setScanning(true);
    setError(null);
    try {
      const res = await fetch("/api/scan-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: imageData.data, mediaType: imageData.mediaType, note }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Scan failed");
        return;
      }
      setResult(body);
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
    });

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
    router.refresh();
  }

  function reset() {
    setImagePreview(null);
    setImageData(null);
    setResult(null);
    setNote("");
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="mx-auto max-w-md px-6 py-8">
      <h1 className="text-2xl font-bold">Scan food</h1>
      <p className="mt-1 text-sm text-zinc-400">Snap a photo and get calories, macros, and a score.</p>

      {!imagePreview && (
        <label className="mt-8 flex aspect-square flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-zinc-700 text-zinc-400 active:bg-zinc-900">
          <span className="text-5xl">📸</span>
          <span className="text-sm font-medium">Tap to take a photo</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </label>
      )}

      {imagePreview && (
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

          {result && (
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <ScoreBadge score={result.score} size="lg" />
                <div>
                  <p className="font-semibold">{result.food_name}</p>
                  <p className="text-sm text-zinc-400">{result.calories} kcal</p>
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
        </div>
      )}

      {error && !result && <p className="mt-4 text-sm text-red-400">{error}</p>}
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
