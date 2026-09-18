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
  counts_for_streak: boolean;
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

export interface LiftMuscle {
  id: string;
  lift_id: string;
  user_id: string;
  muscle_group: string;
}

export type TrainingGoal = "build_muscle" | "get_stronger" | "lose_fat" | "general_fitness";
export type SplitType = "upper_lower" | "ppl" | "bro_split";

export interface TrainingPlan {
  user_id: string;
  training_goal: TrainingGoal;
  split_type: SplitType;
  ideal_weight_lb: number | null;
  sex: string | null;
  day_index: number;
  created_at: string;
  updated_at: string;
}

export interface ProgressPhoto {
  id: string;
  user_id: string;
  taken_at: string;
  photo_url: string;
  angle: "front" | "side" | "back";
  notes: string | null;
  /** 0-100 AI-assessed leanness/definition, comparable across this user's
   * own photos of the same angle over time — see /api/progress-photos/analyze. */
  ai_leanness_score: number | null;
  ai_summary: string | null;
  ai_analyzed_at: string | null;
}

export interface Feedback {
  id: string;
  user_id: string;
  author_email: string | null;
  author_username: string | null;
  message: string;
  created_at: string;
}

export interface Profile {
  user_id: string;
  username: string;
  bio: string | null;
  avatar_url: string | null;
  name_color: string | null;
  verified: boolean;
  rank: string;
  created_at: string;
  updated_at: string;
  timezone: string;
}

export interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
  created_at: string;
}

export interface ProfilePhoto {
  id: string;
  user_id: string;
  photo_url: string;
  caption: string | null;
  created_at: string;
  /** The mirrored community_posts row this photo also appears as — see schema.sql. */
  community_post_id: string | null;
}

export interface Message {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string | null;
  photo_url: string | null;
  read_at: string | null;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_text: string;
  created_at: string;
}

export interface CommunityPost {
  id: string;
  user_id: string;
  author_username: string | null;
  message: string;
  photo_url: string | null;
  created_at: string;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  user_id: string;
  author_username: string | null;
  body: string;
  parent_id: string | null;
  created_at: string;
}

/** Slimmed-down profile info needed to render a colored/verified username
 * anywhere one appears (community, messages, profile header). */
export interface AuthorInfo {
  avatar_url: string | null;
  name_color: string | null;
  verified: boolean;
  rank: string;
}

export interface PhotoLike {
  id: string;
  photo_id: string;
  user_id: string;
  created_at: string;
}

export interface PhotoComment {
  id: string;
  photo_id: string;
  user_id: string;
  author_username: string | null;
  body: string;
  created_at: string;
}

// Minimal Database type so @supabase/ssr's generics are happy.
// Not a full generated schema — safe to leave loose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
