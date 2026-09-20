// Meal slots for the food diary (Breakfast / Lunch / Dinner / Snacks), the
// same layout MyFitnessPal uses. Every food log carries an optional `meal`;
// rows that predate the column (or were logged before the schema change was
// applied) fall back to a guess from the time of day they were logged.

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export const MEAL_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snacks",
};

export function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && (MEAL_ORDER as string[]).includes(value);
}

export function mealForHour(hour: number): MealType {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 21) return "dinner";
  return "snack";
}

function hourIn(date: Date, timeZone?: string | null): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    return Number(parts.find((p) => p.type === "hour")?.value ?? 12);
  } catch {
    return date.getHours();
  }
}

/** The meal to preselect for "right now" in `timeZone` (device-local if omitted). */
export function defaultMealNow(timeZone?: string | null): MealType {
  return mealForHour(hourIn(new Date(), timeZone));
}

/** Which meal slot a log belongs to: its saved meal, else a time-of-day guess. */
export function mealOfLog(log: { meal?: string | null; logged_at: string }, timeZone?: string | null): MealType {
  if (isMealType(log.meal)) return log.meal;
  return mealForHour(hourIn(new Date(log.logged_at), timeZone));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function isMissingMealColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    /'meal' column|column .*meal/i.test(error.message ?? "")
  );
}

/**
 * Inserts a food_logs row. If the database hasn't had the `meal` column added
 * yet (the schema is applied by hand in Supabase Studio), it retries without
 * it rather than failing the whole log — logging food is the main thing this
 * app does and must never break on a pending migration.
 */
export async function insertFoodLog(supabase: AnySupabase, row: Record<string, unknown>) {
  const first = await supabase.from("food_logs").insert(row);
  if (!isMissingMealColumn(first.error)) return first;
  const rest = { ...row };
  delete rest.meal;
  return supabase.from("food_logs").insert(rest);
}
