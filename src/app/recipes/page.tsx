"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Recipe } from "@/lib/types";

export default function RecipesPage() {
  const supabase = createClient();
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [logging, setLogging] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("recipes")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<Recipe[]>();
    setRecipes(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client fetch on mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function logRecipe(id: string) {
    setLogging(id);
    await fetch(`/api/recipes/${id}/log`, { method: "POST" });
    setLogging(null);
    router.push("/");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Recipes</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-semibold text-black"
        >
          {showForm ? "Close" : "+ New"}
        </button>
      </div>

      {showForm && (
        <RecipeForm
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}

      <div className="mt-6 space-y-3">
        {loading && <p className="text-sm text-zinc-500">Loading...</p>}
        {!loading && recipes.length === 0 && !showForm && (
          <div className="rounded-2xl border border-dashed border-zinc-800 py-10 text-center text-sm text-zinc-500">
            No saved recipes yet.
          </div>
        )}
        {recipes.map((r) => (
          <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{r.name}</p>
                <p className="text-xs text-zinc-500">
                  {Math.round(r.calories / r.servings)} calories · {Math.round(r.protein_g / r.servings)}g protein /
                  serving
                </p>
              </div>
              <button
                onClick={() => logRecipe(r.id)}
                disabled={logging === r.id}
                className="shrink-0 rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-emerald-400 disabled:opacity-60"
              >
                {logging === r.id ? "Logging..." : "Log it"}
              </button>
            </div>
            {r.ingredients && <p className="mt-2 text-xs text-zinc-400">{r.ingredients}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function RecipeForm({ onSaved }: { onSaved: () => void }) {
  const supabase = createClient();
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [servings, setServings] = useState(1);
  const [calories, setCalories] = useState(0);
  const [protein, setProtein] = useState(0);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [servingNote, setServingNote] = useState<string | null>(null);
  const [estimated, setEstimated] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function estimate() {
    setEstimating(true);
    setError(null);
    try {
      const res = await fetch("/api/estimate-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ingredients, instructions }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Couldn't estimate nutrition");
        return;
      }
      setCalories(Math.round(body.total_calories));
      setProtein(Math.round(body.total_protein_g));
      setCarbs(Math.round(body.total_carbs_g));
      setFat(Math.round(body.total_fat_g));
      setServings(Math.max(1, Math.round(body.recommended_servings)));
      setServingNote(body.serving_note);
      setEstimated(true);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setEstimating(false);
    }
  }

  async function save() {
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
    const { error } = await supabase.from("recipes").insert({
      user_id: user.id,
      name,
      ingredients,
      instructions,
      servings,
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    onSaved();
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <input
        placeholder="Recipe name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      <textarea
        placeholder="Ingredients (e.g. '1 lb chicken breast, 2 cups rice, 1 tbsp olive oil...')"
        value={ingredients}
        onChange={(e) => {
          setIngredients(e.target.value);
          setEstimated(false);
        }}
        rows={3}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />
      <textarea
        placeholder="Instructions (optional)"
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        rows={2}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
      />

      <button
        onClick={estimate}
        disabled={estimating || !ingredients.trim()}
        className="w-full rounded-xl bg-blue-500 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      >
        {estimating ? "Estimating..." : "✨ Estimate nutrition with AI"}
      </button>

      {estimated && (
        <>
          {servingNote && (
            <p className="rounded-xl bg-zinc-950 p-3 text-xs text-zinc-400">
              <span className="font-semibold text-zinc-300">Suggested serving: </span>
              {servingNote}
            </p>
          )}
          <p className="text-xs text-zinc-500">
            Total nutrition for the whole recipe (feel free to adjust anything below):
          </p>
          <div className="grid grid-cols-2 gap-2">
            <NumberField label="Servings" value={servings} onChange={setServings} />
            <NumberField label="Calories" value={calories} onChange={setCalories} />
            <NumberField label="Protein (g)" value={protein} onChange={setProtein} />
            <NumberField label="Carbs (g)" value={carbs} onChange={setCarbs} />
            <NumberField label="Fat (g)" value={fat} onChange={setFat} />
          </div>
        </>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        onClick={save}
        disabled={saving || !name || !estimated}
        className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
      >
        {saving ? "Saving..." : estimated ? "Save recipe" : "Estimate nutrition first"}
      </button>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
      />
    </label>
  );
}
