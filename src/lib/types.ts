// Hand-written types matching supabase/schema.sql.
// (If you install the Supabase CLI later, you can replace this with
// `supabase gen types typescript` output for full type safety.)

export type GoalPhase = "bulk" | "maintain" | "cut";

export interface Goal {
  user_id: string;
  phase: GoalPhase;
  calorie_target: number;
  protein_target_g: number;
  carb_target_g: number;
  fat_target_g: number;
  current_weight_lb: number | null;
  target_weight_lb: number | null;
  weekly_rate_lb: number;
  height_in: number | null;
  sex: string | null;
  notes: string | null;
  updated_at: string;
}

export interface FoodLog {
  id: string;
  user_id: string;
  logged_at: string;
  photo_url: string | null;
  food_name: string;
  description: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  score: number;
  score_reason: string;
  serving_note: string | null;
  source: "scan" | "recipe" | "manual";
}

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  ingredients: string;
  instructions: string | null;
  servings: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  created_at: string;
}

export interface Measurement {
  id: string;
  user_id: string;
  logged_at: string;
  weight_lb: number | null;
  waist_in: number | null;
  chest_in: number | null;
  arm_in: number | null;
  notes: string | null;
}

export interface Lift {
  id: string;
  user_id: string;
  logged_at: string;
  lift_name: string;
  weight_lb: number;
  reps: number;
  sets: number;
}

export interface ProgressPhoto {
  id: string;
  user_id: string;
  taken_at: string;
  photo_url: string;
  angle: "front" | "side" | "back";
  notes: string | null;
}

export interface Feedback {
  id: string;
  user_id: string;
  author_email: string | null;
  message: string;
  created_at: string;
}

// Minimal Database type so @supabase/ssr's generics are happy.
// Not a full generated schema — safe to leave loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
