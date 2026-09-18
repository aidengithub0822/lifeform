"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { compressImageForUpload } from "@/lib/imageUpload";
import PullToRefresh from "@/components/PullToRefresh";
import { localDateString } from "@/lib/timezone";
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
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [backfillTotal, setBackfillTotal] = useState(0);
  const [backfillDone, setBackfillDone] = useState(0);
  const backfillStarted = useRef(false);

  async function analyzeOnePhoto(photoId: string) {
    try {
      await fetch("/api/progress-photos/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId }),
      });
    } catch {
      // best-effort — the photo itself already saved fine either way
    }
  }

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

  // Backfill: photos uploaded before the AI analysis feature existed (or any
  // that failed to analyze at upload time) never got a score. Run through
  // them once, oldest-first per angle so each comparison chains off the
  // right prior photo, so opening this page after the feature ships gives
  // an immediate result on everything already uploaded instead of leaving
  // old photos permanently blank. Guarded by a ref (not state) so re-renders
  // from `load()` calls inside the loop itself don't restart it.
  useEffect(() => {
    if (backfillStarted.current || photos.length === 0) return;
    const unanalyzed = [...photos].filter((p) => !p.ai_analyzed_at).sort((a, b) => a.taken_at.localeCompare(b.taken_at));
    if (unanalyzed.length === 0) return;
    backfillStarted.current = true;
    (async () => {
      setBackfillTotal(unanalyzed.length);
      setBackfillDone(0);
      for (const p of unanalyzed) {
        setAnalyzingId(p.id);
        await analyzeOnePhoto(p.id);
        setBackfillDone((d) => d + 1);
        await load();
      }
      setAnalyzingId(null);
      fetch("/api/rank", { method: "POST" }).catch(() => {});
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos]);

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
        // Local calendar day, not UTC — see src/lib/timezone.ts. Running in
        // the browser, this needs no explicit timezone: Intl already
        // defaults to the device's real one.
        logged_at: localDateString(new Date()),
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
      const { data: inserted, error: insertError } = await supabase
        .from("progress_photos")
        .insert({
          user_id: user.id,
          taken_at: localDateString(new Date()),
          photo_url: url,
          angle,
        })
        .select("id")
        .single();
      if (insertError) {
        setUploadError(insertError.message);
        return;
      }
      await load();
      // AI leanness analysis runs after the upload itself succeeds, so a slow
      // or failed analysis never blocks the photo from saving — it's fine to
      // let this trail behind and just refresh once it lands.
      if (inserted) {
        setAnalyzingId(inserted.id);
        fetch("/api/progress-photos/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId: inserted.id }),
        })
          .catch(() => {})
          .finally(() => {
            setAnalyzingId(null);
            load();
            fetch("/api/rank", { method: "POST" }).catch(() => {});
          });
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't process that image");
    } finally {
      setUploading(false);
    }
  }

  const chartData = measurements
    .filter((m) => m.weight_lb != null)
    .map((m) => ({ date: m.logged_at.slice(5), weight: Number(m.weight_lb) }));

  const history = [...measurements].sort((a, b) => (a.logged_at < b.logged_at ? 1 : -1));

  const latest = chartData.length ? chartData[chartData.length - 1] : null;
  const prior = chartData.length > 1 ? chartData[chartData.length - 2] : null;
  const delta = latest && prior ? latest.weight - prior.weight : null;

  return (
    <PullToRefresh onRefresh={load}>
    <div className="mx-auto max-w-md px-5 py-7 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
        <p className="mt-0.5 text-xs text-[#71717a]">Weight, photos, and journal — tracked over time</p>
      </div>

      <div className="mt-6 rounded-2xl border border-[#1f1f23] bg-gradient-to-b from-[#111113] to-[#0c0c0e] p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-[#e4e4e7]">Weight</span>
          {latest && <span className="text-xs text-[#52525b]">Latest entries</span>}
        </div>

        {latest ? (
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-[34px] font-bold tracking-tight tabular-nums">{latest.weight}</span>
            <span className="text-sm text-[#71717a]">lb</span>
            {delta != null && (
              <span
                className="ml-0.5 text-sm font-semibold tabular-nums"
                style={{ color: delta <= 0 ? "#34d399" : "#f59e0b" }}
              >
                {delta <= 0 ? "↓" : "↑"} {Math.abs(delta).toFixed(1)} lb
              </span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#71717a]">No entries yet — log today&apos;s weight below.</p>
        )}

        {chartData.length > 1 && (
          <div className="mt-2 h-28">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#52525b" }} axisLine={false} tickLine={false} />
                <YAxis hide domain={["dataMin - 3", "dataMax + 3"]} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8 }} />
                <Line type="monotone" dataKey="weight" stroke="#10b981" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <input
            type="number"
            placeholder="Log today's weight (lb)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-[#27272a] bg-[#111113] px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={logMeasurement}
            disabled={saving || !weight}
            className="shrink-0 rounded-xl bg-[#10b981] px-5 py-2.5 text-sm font-semibold text-[#052e1c] disabled:opacity-60"
          >
            {saving ? "..." : "Log"}
          </button>
        </div>
        {saveError && <p className="mt-2 text-sm text-red-400">{saveError}</p>}
      </div>

      <div className="mt-7 rounded-2xl border border-[#1f1f23] bg-[#0f0f11] p-4">
        <p className="text-sm font-semibold text-[#e4e4e7]">History</p>
        {loading && <p className="mt-3 text-sm text-[#71717a]">Loading...</p>}
        {!loading && history.length === 0 && (
          <p className="mt-3 rounded-2xl border border-dashed border-[#27272a] py-6 text-center text-sm text-[#71717a]">
            No entries yet — log today&apos;s weight above to start your history.
          </p>
        )}
        {history.length > 0 && (
          <div className="mt-1">
            {history.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-[#1a1a1d] py-3">
                <div>
                  <p className="text-sm font-medium tabular-nums text-[#f4f4f5]">
                    {m.weight_lb != null ? `${m.weight_lb} lb` : "No weight logged"}
                  </p>
                  <p className="text-xs text-[#71717a]">{formatDate(m.logged_at)}</p>
                </div>
                <button
                  onClick={() => deleteMeasurement(m.id)}
                  className="text-xs font-medium text-[#52525b] active:opacity-70"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-7 rounded-2xl border border-[#1f1f23] bg-[#0f0f11] p-4">
        <p className="text-sm font-semibold text-[#e4e4e7]">Journal</p>
        <div className="mt-3 space-y-2">
          <textarea
            value={journalDraft}
            onChange={(e) => setJournalDraft(e.target.value)}
            placeholder="How's training going? How do you feel today?"
            rows={3}
            className="w-full resize-none rounded-xl border border-[#27272a] bg-[#111113] px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <button
            onClick={addJournalEntry}
            disabled={journalSaving || !journalDraft.trim()}
            className="w-full rounded-xl bg-[#10b981] py-2.5 text-sm font-semibold text-[#052e1c] disabled:opacity-60"
          >
            {journalSaving ? "Saving..." : "Add entry"}
          </button>
          {journalError && <p className="text-sm text-red-400">{journalError}</p>}
        </div>

        {journal.length > 0 && (
          <div className="mt-2">
            {journal.map((entry) => (
              <div key={entry.id} className="border-b border-[#1a1a1d] py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-medium text-[#52525b]">{formatDateTime(entry.created_at)}</p>
                  <button
                    onClick={() => deleteJournalEntry(entry.id)}
                    className="shrink-0 text-xs font-medium text-[#52525b] active:opacity-70"
                  >
                    Remove
                  </button>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm text-[#e4e4e7]">{entry.entry_text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-7 rounded-2xl border border-[#1f1f23] bg-[#0f0f11] p-4">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-[#e4e4e7]">Progress photos</p>
          <span className="lf-ai-aura rounded-full bg-[#0c1f17] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
            AI scored
          </span>
        </div>
        {backfillTotal > 0 && backfillDone < backfillTotal && (
          <p className="mt-1.5 text-xs text-emerald-400">
            Analyzing your earlier photos with AI… ({backfillDone}/{backfillTotal})
          </p>
        )}
        <div className="mt-3 mb-3 flex gap-2">
          {(["front", "side", "back"] as Angle[]).map((a) => (
            <button
              key={a}
              onClick={() => setAngle(a)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                angle === a ? "bg-[#10b981] text-[#052e1c]" : "bg-[#111113] text-[#a1a1aa] border border-[#27272a]"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-[#27272a] py-6 text-sm text-[#a1a1aa] active:bg-[#111113]">
            {uploading ? "Uploading..." : `Take ${angle} photo`}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])}
            />
          </label>
          <label className="flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-[#27272a] py-6 text-sm text-[#a1a1aa] active:bg-[#111113]">
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
              {p.ai_leanness_score != null && (
                <span className="lf-ai-aura absolute right-1 top-1 rounded-full bg-black/80 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-emerald-300">
                  {p.ai_leanness_score}
                </span>
              )}
              {analyzingId === p.id && (
                <span className="absolute right-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-[#a1a1aa]">
                  Analyzing…
                </span>
              )}
              <p className="mt-1 text-center text-[10px] text-[#52525b]">{formatDate(p.taken_at)}</p>
            </div>
          ))}
        </div>

        {photos.some((p) => p.ai_summary) && (
          <div className="lf-ai-aura mt-4 rounded-2xl bg-[#0b1512] p-3 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">✨ AI notes</p>
            {photos
              .filter((p) => p.ai_summary)
              .slice(0, 3)
              .map((p) => (
                <div key={p.id} className="rounded-xl border border-emerald-500/20 bg-[#111113] p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-medium capitalize text-[#a1a1aa]">
                      {p.angle} · {formatDate(p.taken_at)}
                    </p>
                    {p.ai_leanness_score != null && (
                      <p className="text-xs font-semibold tabular-nums text-emerald-400">{p.ai_leanness_score}/100</p>
                    )}
                  </div>
                  <p className="mt-1 text-sm leading-snug text-[#e4e4e7]">{p.ai_summary}</p>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
    </PullToRefresh>
  );
}
