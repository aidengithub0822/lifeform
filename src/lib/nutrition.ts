import type { GoalPhase } from "@/lib/types";

/**
 * Protein target scales with bodyweight rather than being a fixed number,
 * so it keeps making sense as the user gains weight during a bulk.
 * ~1g/lb bodyweight during a bulk (upper end of the evidence-based range
 * for lean mass gain), ~0.8g/lb during a cut/maintenance (still well above
 * the minimum needed to preserve muscle).
 */
export function recommendedProteinG(weightLb: number, phase: GoalPhase): number {
  const perLb = phase === "cut" ? 0.9 : 1.0;
  return Math.round(weightLb * perLb);
}

/**
 * Very rough Mifflin-St Jeor estimate for a male, moderately active,
 * used only as a sane starting point the user can override — the app
 * should always let goals be edited directly rather than trusting this blindly.
 */
export function estimateMaintenanceCalories(weightLb: number, heightIn: number, age = 19): number {
  const kg = weightLb * 0.453592;
  const cm = heightIn * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + 5; // male formula
  const activityMultiplier = 1.6; // lifting + student activity, moderate
  return Math.round(bmr * activityMultiplier);
}

export function calorieTargetForPhase(maintenance: number, phase: GoalPhase, weeklyRateLb: number): number {
  // ~500 kcal/day surplus or deficit ≈ 1 lb/week; scale to the chosen weekly rate.
  const dailyAdjustment = Math.round((weeklyRateLb * 3500) / 7);
  if (phase === "bulk") return maintenance + Math.abs(dailyAdjustment);
  if (phase === "cut") return maintenance - Math.abs(dailyAdjustment);
  return maintenance;
}

export function macroSplit(calorieTarget: number, proteinG: number) {
  const proteinCals = proteinG * 4;
  const remaining = Math.max(calorieTarget - proteinCals, 0);
  // Favor carbs for training performance and easier bulk-calorie intake,
  // per the "lots of carbs" preference — roughly 60/40 carb/fat split of the remainder.
  const carbCals = remaining * 0.6;
  const fatCals = remaining * 0.4;
  return {
    proteinG: Math.round(proteinG),
    carbsG: Math.round(carbCals / 4),
    fatG: Math.round(fatCals / 9),
  };
}
