// A loose "please be realistic" instruction in a prompt is not a guarantee —
// nothing stopped a model from returning something like "$0.30" for a dozen
// eggs (a real bug reported in this app). This is a hard, server-side floor
// under AI-estimated USD prices: anything outside a category's plausible
// range gets clamped into it rather than shown to the user as-is. It can't
// fix a wrong number that's still *within* the plausible range, but it
// guarantees nothing absurd ever renders.
export interface PriceBounds {
  min: number;
  max: number;
}

export const GROCERY_BOUNDS: Record<"budget" | "moderate" | "splurge", PriceBounds> = {
  budget: { min: 0.4, max: 4 },
  moderate: { min: 1.5, max: 9 },
  splurge: { min: 4, max: 30 },
};

export const RESTAURANT_BOUNDS: PriceBounds = { min: 3, max: 60 };
export const FAST_FOOD_BOUNDS: PriceBounds = { min: 1, max: 18 };

/** Clamps a number into [min, max]; non-finite input falls back to the
 * midpoint of the range rather than propagating NaN/undefined to the UI. */
export function clampPrice(value: unknown, bounds: PriceBounds): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : (bounds.min + bounds.max) / 2;
  return Math.round(Math.min(bounds.max, Math.max(bounds.min, n)) * 100) / 100;
}
