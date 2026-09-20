"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { localDateString } from "@/lib/timezone";
import type { ProgressPhoto } from "@/lib/types";

type Angle = "front" | "side" | "back";

// Full-screen view of one progress photo with the two things that were
// missing: fixing its angle / date / note, and deleting it (which also
// removes the file from storage and refreshes your rank, since photo AI
// scores feed it).
export default function ProgressPhotoSheet({
  photo,
  onClose,
  onChanged,
}: {
  photo: ProgressPhoto;
  onClose: () => void;
  onChanged: () => void;
}) {
  const supabase = createClient();
  const [angle, setAngle] = useState<Angle>(photo.angle);
  const [takenAt, setTakenAt] = useState(photo.taken_at);
  const [notes, setNotes] = useState(photo.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = localDateString(new Date());

  async function save() {
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("progress_photos")
      .update({ angle, taken_at: takenAt || photo.taken_at, notes: notes.trim() || null })
      .eq("id", photo.id);
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onChanged();
    onClose();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from("progress_photos").delete().eq("id", photo.id);
    if (deleteError) {
      setBusy(false);
      setError(deleteError.message);
      return;
    }
    // Best-effort cleanup of the stored file: public URLs look like
    // .../progress-photos/<user_id>/<file>.jpg
    const marker = "/progress-photos/";
    const idx = photo.photo_url.indexOf(marker);
    if (idx !== -1) {
      const path = decodeURIComponent(photo.photo_url.slice(idx + marker.length).split("?")[0]);
      await supabase.storage.from("progress-photos").remove([path]).catch(() => {});
    }
    fetch("/api/rank", { method: "POST" }).catch(() => {});
    setBusy(false);
    onChanged();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-[max(env(safe-area-inset-top),20px)]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-base font-bold text-[#f4f4f5]">Progress photo</h2>
            <button onClick={onClose} className="text-sm text-[#a1a1aa]">
              Close
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.photo_url} alt="" className="max-h-[50vh] w-full rounded-2xl object-contain" />

          {photo.ai_leanness_score != null && (
            <p className="mt-3 text-xs text-emerald-300">AI score: {photo.ai_leanness_score}/100</p>
          )}

          <div className="mt-4 flex gap-2">
            {(["front", "side", "back"] as Angle[]).map((a) => (
              <button
                key={a}
                onClick={() => setAngle(a)}
                className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
                  angle === a ? "bg-[#10b981] text-[#052e1c]" : "border border-[#27272a] bg-[#111113] text-[#a1a1aa]"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-xs font-medium text-[#a1a1aa]">
            Date taken
            <input
              type="date"
              value={takenAt}
              max={today}
              onChange={(e) => setTakenAt(e.target.value)}
              className="mt-1 block w-full rounded-xl border border-[#27272a] bg-[#111113] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>
          <label className="mt-3 block text-xs font-medium text-[#a1a1aa]">
            Note
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional"
              className="mt-1 block w-full resize-none rounded-xl border border-[#27272a] bg-[#111113] px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />
          </label>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          {confirming ? (
            <div className="mt-5 rounded-2xl border border-red-900/50 bg-red-950/30 p-3.5">
              <p className="text-sm text-zinc-200">Delete this photo? This can&apos;t be undone.</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-[#18181b] py-2.5 text-sm font-medium text-[#d4d4d8]"
                >
                  Cancel
                </button>
                <button
                  onClick={remove}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Deleting…" : "Delete photo"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="flex-1 rounded-xl border border-red-900/60 py-2.5 text-sm font-semibold text-red-400"
              >
                Delete
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="flex-[2] rounded-xl bg-[#10b981] py-2.5 text-sm font-semibold text-[#052e1c] disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
