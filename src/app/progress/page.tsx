"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Measurement, ProgressPhoto } from "@/lib/types";

type Angle = "front" | "side" | "back";

export default function ProgressPage() {
  const supabase = createClient();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [saving, setSaving] = useState(false);
  const [angle, setAngle] = useState<Angle>("front");
  const [uploading, setUploading] = useState(false);

  async function load() {
    const [{ data: m }, { data: p }] = await Promise.all([
      supabase
        .from("measurements")
        .select("*")
        .order("logged_at", { ascending: true })
        .returns<Measurement[]>(),
      supabase
        .from("progress_photos")
        .select("*")
        .order("taken_at", { ascending: false })
        .returns<ProgressPhoto[]>(),
    ]);
    setMeasurements(m ?? []);
    setPhotos(p ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logMeasurement() {
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("measurements").upsert(
      {
        user_id: user.id,
        logged_at: new Date().toISOString().slice(0, 10),
        weight_lb: weight ? Number(weight) : null,
        waist_in: waist ? Number(waist) : null,
      },
      { onConflict: "user_id,logged_at" }
    );
    setWeight("");
    setWaist("");
    setSaving(false);
    load();
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const path = `${user.id}/${Date.now()}-${angle}.jpg`;
    const { error } = await supabase.storage.from("progress-photos").upload(path, file);
    if (!error) {
      const url = supabase.storage.from("progress-photos").getPublicUrl(path).data.publicUrl;
      await supabase.from("progress_photos").insert({
        user_id: user.id,
        taken_at: new Date().toISOString().slice(0, 10),
        photo_url: url,
        angle,
      });
      load();
    }
    setUploading(false);
  }

  const chartData = measurements
    .filter((m) => m.weight_lb != null)
    .map((m) => ({ date: m.logged_at.slice(5), weight: Number(m.weight_lb) }));

  return (
    <div className="mx-auto max-w-md px-5 py-8 pb-8">
      <h1 className="text-2xl font-bold">Progress</h1>

      <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="mb-3 text-sm font-semibold text-zinc-300">Today&apos;s numbers</p>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Weight (lb)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-1/2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <input
            type="number"
            placeholder="Waist (in)"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
            className="w-1/2 rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <button
          onClick={logMeasurement}
          disabled={saving || (!weight && !waist)}
          className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          {saving ? "Saving..." : "Log"}
        </button>
      </div>

      {chartData.length > 1 && (
        <div className="mt-5 h-48 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="mb-2 text-sm font-semibold text-zinc-300">Weight trend</p>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#71717a" }} />
              <YAxis
                domain={["dataMin - 3", "dataMax + 3"]}
                tick={{ fontSize: 10, fill: "#71717a" }}
                width={30}
              />
              <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
              <Line type="monotone" dataKey="weight" stroke="#22c55e" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-zinc-300">Progress photos</p>
        <div className="mb-3 flex gap-2">
          {(["front", "side", "back"] as Angle[]).map((a) => (
            <button
              key={a}
              onClick={() => setAngle(a)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                angle === a ? "bg-emerald-500 text-black" : "bg-zinc-900 text-zinc-400"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <label className="flex items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 py-6 text-sm text-zinc-400 active:bg-zinc-900">
          {uploading ? "Uploading..." : `+ Add ${angle} photo`}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
          />
        </label>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={p.photo_url}
              alt={`${p.angle} progress photo from ${p.taken_at}`}
              className="aspect-square w-full rounded-xl object-cover"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
