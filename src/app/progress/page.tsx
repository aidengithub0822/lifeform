"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/imageUpload";
import PullToRefresh from "@/components/PullToRefresh";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Measurement, ProgressPhoto, JournalEntry } from "@/lib/types";

type Angle = "front" | "side" | "back";

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ProgressPage() {
  const supabase = createClient();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [weight, setWeight] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [angle, setAngle] = useState<Angle>("front");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [journalDraft, setJournalDraft] = useState("");
  const [journalSaving, setJournalSaving] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);

  async function load() {
    const [{ data: m }, { data: p }, { data: j }] = await Promise.all([
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
      supabase
        .from("journal_entries")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<JournalEntry[]>(),
    ]);
    setMeasurements(m ?? []);
    setPhotos(p ?? []);
    setJournal(j ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logMeasurement() {
    setSaving(true);
    setSaveError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaveError("Not signed in");
      setSaving(false);
      return;
    }
    const { error } = await supabase.from("measurements").upsert(
      {
        user_id: user.id,
        logged_at: new Date().toISOString().slice(0, 10),
        weight_lb: weight ? Number(weight) : null,
      },
      { onConflict: "user_id,logged_at" }
    );
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    setWeight("");
    await load();
  }

  async function deleteMeasurement(id: string) {
    await supabase.from("measurements").delete().eq("id", id);
    await load();
  }

  async function addJournalEntry() {
    const entry_text = journalDraft.trim();
    if (!entry_text) return;
    setJournalSaving(true);
    setJournalError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setJournalError("Not signed in");
      setJournalSaving(false);
      return;
    }
    const { error } = await supabase.from("journal_entries").insert({ user_id: user.id, entry_text });
    setJournalSaving(false);
    if (error) {
      setJournalError(error.message);
      return;
    }
    setJournalDraft("");
    await load();
  }

  async function deleteJournalEntry(id: string) {
    await supabase.from("journal_entries").delete().eq("id", id);
    await load();
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setUploadError("Not signed in");
        return;
      }
      const blob = await compressImageForUpload(file, 1600, 0.85);
      const path = `${user.id}/${Date.now()}-${angle}.jpg`;
      const { error } = await supabase.storage.from("progress-photos").upload(path, blob, {
        contentType: "image/jpeg",
      });
      if (error) {
        setUploadError(error.message);
        return;
      }
      const url = supabase.storage.from("progress-photos").getPublicUrl(path).data.publicUrl;
      const { error: insertError } = await supabase.from("progress_photos").insert({
        user_id: user.id,
        taken_at: new Date().toISOString().slice(0, 10),
        photo_url: url,
        angle,
      });
      if (insertError) setUploadError(insertError.message);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't process that image");
    } finally {
      setUploading(false);
      await load();
    }
  }

  const chartData = measurements
    .filter((m) => m.weight_lb != null)
    .map((m) => ({ date: m.logged_at.slice(5), weight: Number(m.weight_lb) }));

  const history = [...measurements].sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1));

  return (
    <PullToRefresh onRefresh={load}>
    <div className="mx-auto max-w-md px-5 py-8 pb-8">
      <h1 className="text-2xl font-bold">Progress</h1>

      <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="mb-3 text-sm font-semibold text-zinc-300">Today&apos;s numbers</p>
        <input
          type="number"
          placeholder="Weight (lb)"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />
        <button
          onClick={logMeasurement}
          disabled={saving || !weight}
          className="mt-3 w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
        >
          {saving ? "Saving..." : "Log"}
        </button>
        {saveError && <p className="mt-2 text-sm text-red-400">{saveError}</p>}
        <p className="mt-2 text-xs text-zinc-500">
          Logging today again updates today&apos;s entry instead of adding a duplicate.
        </p>
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
        <p className="mb-3 text-sm font-semibold text-zinc-300">History</p>
        {loading && <p className="text-sm text-zinc-500">Loading...</p>}
        {!loading && history.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-800 py-6 text-center text-sm text-zinc-500">
            No entries yet — log today&apos;s weight above to start your history.
          </p>
        )}
        {history.length > 0 && (
          <div className="space-y-2">
            {history.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-zinc-100">
                    {m.weight_lb != null ? `${m.weight_lb} lb` : "No weight logged"}
                  </p>
                  <p className="text-xs text-zinc-500">{formatDate(m.logged_at)}</p>
                </div>
                <button
                  onClick={() => deleteMeasurement(m.id)}
                  className="text-xs font-medium text-zinc-500 active:opacity-70"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <p className="mb-3 text-sm font-semibold text-zinc-300">Journal</p>
        <div className="space-y-2">
          <textarea
            value={journalDraft}
            onChange={(e) => setJournalDraft(e.target.value)}
            placeholder="How's training going? How do you feel today?"
            rows={3}
            className="w-full resize-none rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={addJournalEntry}
            disabled={journalSaving || !journalDraft.trim()}
            className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
          >
            {journalSaving ? "Saving..." : "Add entry"}
          </button>
          {journalError && <p className="text-sm text-red-400">{journalError}</p>}
        </div>

        {journal.length > 0 && (
          <div className="mt-4 space-y-2">
            {journal.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-zinc-500">{formatDateTime(entry.created_at)}</p>
                  <button
                    onClick={() => deleteJournalEntry(entry.id)}
                    className="shrink-0 text-xs font-medium text-zinc-500 active:opacity-70"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-zinc-200">{entry.entry_text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

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
        <div className="flex gap-2">
          <label className="flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 py-6 text-sm text-zinc-400 active:bg-zinc-900">
            {uploading ? "Uploading..." : `Take ${angle} photo`}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
            />
          </label>
          <label className="flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 py-6 text-sm text-zinc-400 active:bg-zinc-900">
            {uploading ? "Uploading..." : "Choose from library"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
            />
          </label>
        </div>
        {uploadError && <p className="mt-2 text-sm text-red-400">{uploadError}</p>}

        <div className="mt-4 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.photo_url}
                alt={`${p.angle} progress photo from ${p.taken_at}`}
                className="aspect-square w-full rounded-xl object-cover"
              />
              <p className="mt-1 text-center text-[10px] text-zinc-500">{formatDate(p.taken_at)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
    </PullToRefresh>
  );
}
