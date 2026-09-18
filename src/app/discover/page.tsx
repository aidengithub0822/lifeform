"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface FoodPick {
  food_name: string;
  budget_tier: "budget" | "moderate" | "splurge";
  est_price_usd: number;
  calories: number;
  protein_g: number;
  why: string;
}

interface Place {
  name: string;
  cuisine: string;
  price_range: "$" | "$$" | "$$$";
  est_price_usd: number;
  order_suggestion: string;
  why: string;
}

interface FastFoodPick {
  chain: string;
  item: string;
  est_price_usd: number;
  calories: number;
  protein_g: number;
  why: string;
}

const TIER_LABEL: Record<FoodPick["budget_tier"], string> = {
  budget: "Budget",
  moderate: "Moderate",
  splurge: "Splurge",
};

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function DiscoverPage() {
  const [tab, setTab] = useState<"foods" | "places" | "fastfood">("foods");

  const [summary, setSummary] = useState<string | null>(null);
  const [picks, setPicks] = useState<FoodPick[] | null>(null);
  const [foodsError, setFoodsError] = useState<string | null>(null);
  const [loadingFoods, setLoadingFoods] = useState(true);

  const [town, setTown] = useState("");
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(false);

  const [fastFood, setFastFood] = useState<FastFoodPick[] | null>(null);
  const [fastFoodError, setFastFoodError] = useState<string | null>(null);
  const [loadingFastFood, setLoadingFastFood] = useState(true);

  useEffect(() => {
    loadFoods();
    loadFastFood();
  }, []);

  async function loadFoods() {
    setLoadingFoods(true);
    setFoodsError(null);
    try {
      const res = await fetch("/api/recommend-foods");
      const body = await res.json();
      if (!res.ok) {
        setFoodsError(body.error || "Couldn't load recommendations");
        return;
      }
      setSummary(body.summary);
      setPicks(body.picks);
    } catch {
      setFoodsError("Couldn't reach the server");
    } finally {
      setLoadingFoods(false);
    }
  }

  async function loadFastFood() {
    setLoadingFastFood(true);
    setFastFoodError(null);
    try {
      const res = await fetch("/api/recommend-fastfood");
      const body = await res.json();
      if (!res.ok) {
        setFastFoodError(body.error || "Couldn't load recommendations");
        return;
      }
      setFastFood(body.picks);
    } catch {
      setFastFoodError("Couldn't reach the server");
    } finally {
      setLoadingFastFood(false);
    }
  }

  async function findPlaces() {
    if (!town.trim()) return;
    setLoadingPlaces(true);
    setPlacesError(null);
    setPlaces(null);
    try {
      const res = await fetch("/api/recommend-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ town }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPlacesError(body.error || "Couldn't load suggestions");
        return;
      }
      setPlaces(body.places);
    } catch {
      setPlacesError("Couldn't reach the server");
    } finally {
      setLoadingPlaces(false);
    }
  }

  const grouped = picks
    ? (["budget", "moderate", "splurge"] as const).map((tier) => ({
        tier,
        items: picks.filter((p) => p.budget_tier === tier),
      }))
    : [];

  const groupedByChain = fastFood
    ? Object.entries(
        fastFood.reduce<Record<string, FastFoodPick[]>>((acc, p) => {
          (acc[p.chain] ??= []).push(p);
          return acc;
        }, {})
      )
    : [];

  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <Link href="/" className="text-sm font-medium text-emerald-400">
        ← Back
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Discover</h1>
      <p className="mt-1 text-sm text-zinc-400">Foods and places that fit your goal and your budget.</p>

      <div className="mt-5 flex gap-1.5 rounded-full bg-zinc-900 p-1">
        {(
          [
            { key: "foods", label: "Groceries" },
            { key: "fastfood", label: "Fast food" },
            { key: "places", label: "Places" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-full py-1.5 text-xs font-semibold ${
              tab === t.key ? "bg-emerald-500 text-black" : "text-zinc-400"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "foods" && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-300">Best foods for your goal, by budget</h2>

          {loadingFoods && <p className="mt-3 text-sm text-zinc-500">Thinking...</p>}
          {foodsError && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-red-400">{foodsError}</p>
              <button onClick={loadFoods} className="text-sm font-medium text-emerald-400">
                Try again
              </button>
            </div>
          )}

          {summary && <p className="mt-2 text-sm text-zinc-400">{summary}</p>}

          {grouped.map(
            ({ tier, items }) =>
              items.length > 0 && (
                <div key={tier} className="mt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{TIER_LABEL[tier]}</p>
                  <div className="space-y-2">
                    {items.map((item) => (
                      <div key={item.food_name} className="lf-gradient-border p-3.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-semibold text-zinc-100">{item.food_name}</p>
                          <p className="shrink-0 text-xs font-medium text-emerald-400">{money(item.est_price_usd)}/serving</p>
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {item.calories} cal · {item.protein_g}g protein per serving
                        </p>
                        <p className="mt-1.5 text-xs text-zinc-400">{item.why}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
          )}
        </div>
      )}

      {tab === "fastfood" && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-300">Best fast food orders for your goal</h2>
          <p className="mt-1 text-xs text-zinc-500">
            AI picks from popular nationwide chains — always double-check current menu prices, they change often.
          </p>

          {loadingFastFood && <p className="mt-3 text-sm text-zinc-500">Thinking...</p>}
          {fastFoodError && (
            <div className="mt-3 space-y-2">
              <p className="text-sm text-red-400">{fastFoodError}</p>
              <button onClick={loadFastFood} className="text-sm font-medium text-emerald-400">
                Try again
              </button>
            </div>
          )}

          {groupedByChain.map(([chain, items]) => (
            <div key={chain} className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{chain}</p>
              <div className="space-y-2">
                {items.map((item, i) => (
                  <div key={`${item.item}-${i}`} className="lf-gradient-border p-3.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-100">{item.item}</p>
                      <p className="shrink-0 text-xs font-medium text-emerald-400">{money(item.est_price_usd)}</p>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {item.calories} cal · {item.protein_g}g protein
                    </p>
                    <p className="mt-1.5 text-xs text-zinc-400">{item.why}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "places" && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-zinc-300">Places to eat</h2>
          <p className="mt-1 text-xs text-zinc-500">
            AI suggestions based on general knowledge of your area — not live listings, so double-check hours, menus, and prices.
          </p>

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={town}
              onChange={(e) => setTown(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && findPlaces()}
              placeholder="City, State"
              className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-emerald-500"
            />
            <button
              onClick={findPlaces}
              disabled={loadingPlaces || !town.trim()}
              className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60"
            >
              {loadingPlaces ? "..." : "Go"}
            </button>
          </div>

          {placesError && <p className="mt-3 text-sm text-red-400">{placesError}</p>}

          {places && (
            <div className="mt-4 space-y-2">
              {places.map((place, i) => (
                <div key={`${place.name}-${i}`} className="lf-gradient-border p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-100">{place.name}</p>
                    <p className="shrink-0 text-xs font-medium text-zinc-400">
                      {place.price_range} · {money(place.est_price_usd)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">{place.cuisine}</p>
                  <p className="mt-1.5 text-xs text-emerald-400">Order: {place.order_suggestion}</p>
                  <p className="mt-1 text-xs text-zinc-400">{place.why}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
