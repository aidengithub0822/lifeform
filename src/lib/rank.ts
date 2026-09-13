// Pure rank logic — no I/O — mirrors the shape of streak.ts.
//
// Ranks reward being on the app a long time AND making a drastic change
// from where someone started: measured by strength gained (a validated
// gender-appropriate 1-rep-max) OR bodyweight lost, gated by account age
// and XP so nobody can rank up overnight. Reaching a tier requires the
// time/XP gate AND at least one of the strength/weight-loss gates — the
// higher of the two "drastic change" paths is what counts.
//
// Anti-cheat is deliberately generous rather than perfectly rigorous (this
// is a fitness app, not a competition federation), but it rules out the
// obvious ways to fake a rank: a single made-up log entry, a one-day
// "before/after" number, or a rep-heavy set standing in for a real max.

export type RankTier =
  | "newbie"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "champion"
  | "grand_champion"
  | "titan";

export interface RankTierMeta {
  tier: RankTier;
  label: string;
  /** Name color applied when the user has no dev-assigned override. null = default text color. */
  color: string | null;
  minAccountAgeDays: number;
  minXp: number;
  /** Validated near-max lift (bench for men, squat for women) required, in lb. */
  liftLb: number;
  /** Sustained bodyweight loss required, as % of starting weight. */
  lossPct: number;
  /** Path (under /public) to this tier's badge artwork. */
  badge: string;
}

// Grand Champion was originally pinned to the numbers actually requested:
// 405 bench for men, 405 squat for women. Titan sits above it as the true
// ceiling tier — a number few will ever hit, by design.
export const RANK_TIERS: RankTierMeta[] = [
  { tier: "newbie", label: "Newbie", color: null, minAccountAgeDays: 0, minXp: 0, liftLb: 0, lossPct: 0, badge: "/badges/newbie.webp" },
  { tier: "bronze", label: "Bronze", color: "#92400e", minAccountAgeDays: 14, minXp: 200, liftLb: 135, lossPct: 5, badge: "/badges/bronze.webp" },
  { tier: "silver", label: "Silver", color: "#9ca3af", minAccountAgeDays: 30, minXp: 500, liftLb: 185, lossPct: 10, badge: "/badges/silver.webp" },
  { tier: "gold", label: "Gold", color: "#eab308", minAccountAgeDays: 60, minXp: 1000, liftLb: 225, lossPct: 15, badge: "/badges/gold.webp" },
  { tier: "platinum", label: "Platinum", color: "#7dd3fc", minAccountAgeDays: 120, minXp: 2000, liftLb: 275, lossPct: 20, badge: "/badges/platinum.webp" },
  { tier: "diamond", label: "Diamond", color: "#1d4ed8", minAccountAgeDays: 180, minXp: 3500, liftLb: 315, lossPct: 25, badge: "/badges/diamond.webp" },
  { tier: "champion", label: "Champion", color: "#9333ea", minAccountAgeDays: 270, minXp: 5000, liftLb: 365, lossPct: 30, badge: "/badges/champion.webp" },
  { tier: "grand_champion", label: "Grand Champion", color: "#ec4899", minAccountAgeDays: 365, minXp: 8000, liftLb: 405, lossPct: 35, badge: "/badges/grand-champion.webp" },
  { tier: "titan", label: "Titan", color: "#f8fafc", minAccountAgeDays: 545, minXp: 12000, liftLb: 455, lossPct: 40, badge: "/badges/titan.webp" },
];

export function rankMeta(tier: string | null | undefined): RankTierMeta {
  return RANK_TIERS.find((t) => t.tier === tier) ?? RANK_TIERS[0];
}

export function isBenchName(name: string): boolean {
  return /bench/i.test(name);
}

export function isSquatName(name: string): boolean {
  return /squat/i.test(name);
}

export interface LiftRow {
  logged_at: string;
  weight_lb: number;
  reps: number;
}

const MIN_NEAR_MAX_LOGS = 3; // need at least this many near-max attempts to trust a "max" at all
const MAX_PLAUSIBLE_JUMP_LB = 15; // a single new max can't leap more than this over the running max
const MAX_MAX_REPS = 5; // only near-max effort sets (low reps) count toward a 1RM-ish number

/**
 * Best validated near-max lift for one exercise. Filters to low-rep sets
 * (a "225x20" doesn't prove a 225 max), requires a minimum number of such
 * logs so one entry can't manufacture a max, and walks them in time order
 * rejecting any single jump implausibly larger than real progression.
 */
export function bestValidatedMax(rows: LiftRow[]): number {
  const nearMax = rows
    .filter((r) => r.reps >= 1 && r.reps <= MAX_MAX_REPS && r.weight_lb > 0)
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  if (nearMax.length < MIN_NEAR_MAX_LOGS) return 0;

  let runningMax = 0;
  for (const r of nearMax) {
    const jump = r.weight_lb - runningMax;
    if (runningMax === 0 || jump <= MAX_PLAUSIBLE_JUMP_LB) {
      runningMax = Math.max(runningMax, r.weight_lb);
    }
    // else: treat as an outlier (typo or faked entry) — it doesn't count.
  }
  return runningMax;
}

export interface WeightRow {
  logged_at: string;
  weight_lb: number | null;
}

const MIN_MEASUREMENTS = 5;
const MIN_SPAN_DAYS = 30;
const MAX_PLAUSIBLE_LOSS_LB_PER_WEEK = 3;

/**
 * Validated sustained weight-loss percentage. Averages the first/last few
 * measurements (so one lowball or one rebound entry can't swing the number),
 * requires the history to span a real amount of time, and caps the counted
 * loss at a healthy sustainable rate so a single fabricated "before" weight
 * can't manufacture a huge percentage.
 */
export function validatedWeightLossPct(rows: WeightRow[]): number {
  const sorted = rows
    .filter((r): r is { logged_at: string; weight_lb: number } => typeof r.weight_lb === "number" && r.weight_lb > 0)
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at));
  if (sorted.length < MIN_MEASUREMENTS) return 0;

  const spanDays = daysBetween(sorted[0].logged_at, sorted[sorted.length - 1].logged_at);
  if (spanDays < MIN_SPAN_DAYS) return 0;

  const edgeCount = Math.min(3, Math.floor(sorted.length / 2) || 1);
  const startAvg = average(sorted.slice(0, edgeCount).map((r) => r.weight_lb));
  const endAvg = average(sorted.slice(-edgeCount).map((r) => r.weight_lb));
  const rawLoss = startAvg - endAvg;
  if (rawLoss <= 0) return 0;

  const maxPlausibleLoss = (spanDays / 7) * MAX_PLAUSIBLE_LOSS_LB_PER_WEEK;
  const clampedLoss = Math.min(rawLoss, maxPlausibleLoss);
  return (clampedLoss / startAvg) * 100;
}

export interface PhotoLeanRow {
  taken_at: string;
  ai_leanness_score: number | null;
}

const MIN_ANALYZED_PHOTOS = 3; // fewer required than scale measurements — photos are naturally logged less often
const MIN_PHOTO_SPAN_DAYS = 30;
const MAX_PLAUSIBLE_LEAN_GAIN_PER_WEEK = 3; // score points/week, same "generous but not infinite" spirit as the weight cap

/**
 * Validated leanness gain from AI-scored progress photos, expressed on the
 * same 0-100-ish scale as validatedWeightLossPct's percentage so it can
 * plug into the same "OR" gate in computeRank. This is the signal a
 * cutting-goal user's rank should mostly move on: the user's own words were
 * that "most of the weight loss difference is determined by the progress
 * pictures they are taking" — the scale can be noisy (water weight, time of
 * day), but a sustained increase in AI-assessed definition across a user's
 * own photos of the same angle is a more direct read on visible cutting
 * progress. Same anti-cheat shape as the weight-loss validator: needs a
 * minimum number of analyzed photos spanning real time, averages the
 * edges so one flattering or unflattering photo can't swing it, and caps
 * the counted gain at a plausible rate.
 */
export function validatedPhotoLeanGainPct(rows: PhotoLeanRow[]): number {
  const sorted = rows
    .filter((r): r is { taken_at: string; ai_leanness_score: number } => typeof r.ai_leanness_score === "number")
    .sort((a, b) => a.taken_at.localeCompare(b.taken_at));
  if (sorted.length < MIN_ANALYZED_PHOTOS) return 0;

  const spanDays = daysBetween(sorted[0].taken_at, sorted[sorted.length - 1].taken_at);
  if (spanDays < MIN_PHOTO_SPAN_DAYS) return 0;

  const edgeCount = Math.min(2, Math.floor(sorted.length / 2) || 1);
  const startAvg = average(sorted.slice(0, edgeCount).map((r) => r.ai_leanness_score));
  const endAvg = average(sorted.slice(-edgeCount).map((r) => r.ai_leanness_score));
  const rawGain = endAvg - startAvg;
  if (rawGain <= 0) return 0;

  const maxPlausibleGain = (spanDays / 7) * MAX_PLAUSIBLE_LEAN_GAIN_PER_WEEK;
  return Math.min(rawGain, maxPlausibleGain);
}

export function daysBetween(a: string, b: string): number {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function average(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export interface ComputeRankInput {
  accountCreatedAt: string;
  xp: number;
  sex: string | null;
  benchMaxLb: number;
  squatMaxLb: number;
  weightLossPct: number;
  /** From validatedPhotoLeanGainPct — AI-assessed leanness gain from progress
   * photos, on the same scale as weightLossPct. Optional so existing callers
   * that don't yet pass it still work; defaults to 0 (no photo signal). */
  photoLeanGainPct?: number;
}

/**
 * Highest tier whose time/XP gate AND (strength OR weight-loss) gate both
 * pass. Men are judged on bench, women on squat, per the spec; anyone whose
 * sex isn't set yet gets whichever of the two is more favorable so a missing
 * profile field never blocks ranking up. The "weight-loss" side of the gate
 * is really "visible cutting progress" — whichever is higher of the scale
 * trend or the AI photo-leanness trend counts, since a cutting-goal user's
 * progress photos are often the more honest signal than a noisy scale.
 */
export function computeRank(input: ComputeRankInput): RankTier {
  const accountAgeDays = daysBetween(input.accountCreatedAt, new Date().toISOString());
  const sex = (input.sex ?? "").trim().toLowerCase();
  const strengthLb =
    sex === "male" || sex === "man" || sex === "m"
      ? input.benchMaxLb
      : sex === "female" || sex === "woman" || sex === "f"
        ? input.squatMaxLb
        : Math.max(input.benchMaxLb, input.squatMaxLb);
  const cuttingProgressPct = Math.max(input.weightLossPct, input.photoLeanGainPct ?? 0);

  let best: RankTier = "newbie";
  for (const t of RANK_TIERS) {
    if (t.tier === "newbie") continue;
    const timeOk = accountAgeDays >= t.minAccountAgeDays && input.xp >= t.minXp;
    const changeOk = strengthLb >= t.liftLb || cuttingProgressPct >= t.lossPct;
    if (timeOk && changeOk) best = t.tier;
  }
  return best;
}

// XP per "level" shown on the Fitness page's rank card — a lighter-weight,
// purely cosmetic counter layered on top of the tier system (levels climb
// continuously with XP; tiers still gate on the age/strength/loss rules
// above). 250 XP/level is arbitrary but keeps early levels from feeling
// instant while still ticking up noticeably as the streak XP grows.
const XP_PER_LEVEL = 250;

export function xpLevel(xp: number): number {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

export interface RankProgress {
  tier: RankTier;
  nextTier: RankTier | null;
  /** 0-1 toward nextTier; 1 (with nextTier null) once at the top tier. */
  progress: number;
  limitingFactor: "time" | "xp" | "strength" | null;
}

/**
 * Progress toward the NEXT tier above whatever computeRank already settled
 * on, for the rank card's progress bar. Mirrors computeRank's gates: the
 * time/XP gate must clear AND at least one of strength/weight-loss must —
 * so progress is the minimum of the time gate, the XP gate, and the BETTER
 * of the two change paths (since only one of them needs to clear).
 */
export function computeRankProgress(input: ComputeRankInput): RankProgress {
  const tier = computeRank(input);
  const idx = RANK_TIERS.findIndex((t) => t.tier === tier);
  const nextIdx = idx + 1;
  if (nextIdx >= RANK_TIERS.length) {
    return { tier, nextTier: null, progress: 1, limitingFactor: null };
  }
  const next = RANK_TIERS[nextIdx];
  const accountAgeDays = daysBetween(input.accountCreatedAt, new Date().toISOString());
  const sex = (input.sex ?? "").trim().toLowerCase();
  const strengthLb =
    sex === "male" || sex === "man" || sex === "m"
      ? input.benchMaxLb
      : sex === "female" || sex === "woman" || sex === "f"
        ? input.squatMaxLb
        : Math.max(input.benchMaxLb, input.squatMaxLb);

  const cuttingProgressPct = Math.max(input.weightLossPct, input.photoLeanGainPct ?? 0);
  const timeProgress = next.minAccountAgeDays === 0 ? 1 : Math.min(1, accountAgeDays / next.minAccountAgeDays);
  const xpProgress = next.minXp === 0 ? 1 : Math.min(1, input.xp / next.minXp);
  const strengthProgress = next.liftLb === 0 ? 1 : Math.min(1, strengthLb / next.liftLb);
  const lossProgress = next.lossPct === 0 ? 1 : Math.min(1, cuttingProgressPct / next.lossPct);
  const changeProgress = Math.max(strengthProgress, lossProgress);

  const progress = Math.min(timeProgress, xpProgress, changeProgress);
  const limitingFactor: RankProgress["limitingFactor"] =
    progress === changeProgress && changeProgress < 1
      ? "strength"
      : progress === xpProgress && xpProgress < 1
        ? "xp"
        : progress < 1
          ? "time"
          : null;

  return { tier, nextTier: next.tier, progress, limitingFactor };
}
