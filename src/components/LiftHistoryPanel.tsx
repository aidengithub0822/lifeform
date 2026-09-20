"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lift } from "@/lib/types";

// "My lifts": every logged lift, newest first, each editable (weight / reps /
// sets) or deletable — so a typo'd set doesn't sit in the record (and skew
// your muscle ranks) forever.
export default function LiftHistoryPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const supabase = createClient();
  const [lifts, setLifts] = useState<Lift[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [sets, setSets] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: loadError } = await supabase
      .from("lifts")
      .select("*")
      .order("logged_at", { ascending: false })
      .limit(150)
      .returns<Lift[]>();
    if (loadError) setError(loadError.message);
    setLifts(data ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ranks are derived from logged lifts, so refresh them after any change.
  function afterChange() {
    fetch("/api/rank", { method: "POST" }).catch(() => {});
    onChanged();
  }

  function startEdit(l: Lift) {
    setEditingId(l.id);
    setDeletingId(null);
    setWeight(String(l.weight_lb));
    setReps(String(l.reps));
    setSets(String(l.sets));
    setError(null);
  }

  async function save(l: Lift) {
    const w = Number(weight);
    const r = Number(reps);
    const s = Number(sets);
    if (!Number.isFinite(w) || w < 0) return setError("Enter a valid weight");
    if (!Number.isInteger(r) || r <= 0) return setError("Enter a valid rep count");
    if (!Number.isInteger(s) || s <= 0) return setError("Enter a valid set count");
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.from("lifts").update({ weight_lb: w, reps: r, sets: s }).eq("id", l.id);
    setBusy(false);
    if (updateError) return setError(updateError.message);
    setLifts((prev) => prev?.map((x) => (x.id === l.id ? { ...x, weight_lb: w, reps: r, sets: s } : x)) ?? prev);
    setEditingId(null);
    afterChange();
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase.from("lifts").delete().eq("id", id);
    setBusy(false);
    if (deleteError) return setError(deleteError.message);
    setLifts((prev) => prev?.filter((x) => x.id !== id) ?? prev);
    setDeletingId(null);
    afterChange();
  }

  const field =
    "mt-0.5 w-full rounded-lg border border-[#27272a] bg-[#111113] px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-emerald-500";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-[#1f1f23] bg-[#0d0d0f] p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#f4f4f5]">My lifts</h2>
          <button onClick={onClose} className="text-sm text-[#71717a]">
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-[#71717a]">Fix a typo or remove a set you logged by mistake.</p>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        {lifts === null && <p className="mt-4 text-sm text-[#71717a]">Loading…</p>}
        {lifts?.length === 0 && <p className="mt-4 text-sm text-[#71717a]">No lifts logged yet.</p>}

        <div className="mt-3">
          {lifts?.map((l) =>
            editingId === l.id ? (
              <div key={l.id} className="space-y-2 border-b border-[#1a1a1d] py-3">
                <p className="text-sm font-medium text-[#f4f4f5]">{l.lift_name}</p>
                <div className="grid grid-cols-3 gap-2">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">
                    Weight (lb)
                    <input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className={field} />
                  </label>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">
                    Reps
                    <input value={reps} onChange={(e) => setReps(e.target.value)} inputMode="numeric" className={field} />
                  </label>
                  <label className="text-[10px] font-medium uppercase tracking-wide text-[#71717a]">
                    Sets
                    <input value={sets} onChange={(e) => setSets(e.target.value)} inputMode="numeric" className={field} />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                    className="flex-1 rounded-lg bg-[#18181b] py-2 text-xs font-medium text-[#d4d4d8]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => save(l)}
                    disabled={busy}
                    className="flex-[2] rounded-lg bg-emerald-500 py-2 text-xs font-semibold text-black disabled:opacity-60"
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              <div key={l.id} className="flex items-center gap-3 border-b border-[#1a1a1d] py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#f4f4f5]">{l.lift_name}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-[#71717a]">
                    {l.weight_lb} lb × {l.reps} × {l.sets} {l.sets === 1 ? "set" : "sets"} ·{" "}
                    {new Date(`${l.logged_at}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                {deletingId === l.id ? (
                  <>
                    <button onClick={() => setDeletingId(null)} className="text-xs font-medium text-[#a1a1aa]">
                      Cancel
                    </button>
                    <button
                      onClick={() => remove(l.id)}
                      disabled={busy}
                      className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => startEdit(l)} className="text-xs font-medium text-[#71717a] active:text-emerald-400">
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setDeletingId(l.id);
                        setEditingId(null);
                      }}
                      className="text-xs font-medium text-[#52525b] active:text-red-400"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
