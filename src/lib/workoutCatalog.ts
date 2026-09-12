// Static curated workout catalog, organized by muscle-group category.
// No AI/DB call needed here — this is a fixed reference list, fast and free
// to render, matched against the labels on the body diagrams.

export type MuscleCategory = "chest" | "back" | "shoulders" | "arms" | "legs" | "abs";

export interface Exercise {
  name: string;
  sets: string;
  notes: string;
}

export const CATEGORIES: { key: MuscleCategory; label: string; icon: string }[] = [
  { key: "chest", label: "Chest", icon: "🏋️" },
  { key: "back", label: "Back", icon: "🔙" },
  { key: "shoulders", label: "Shoulders", icon: "💪" },
  { key: "arms", label: "Arms", icon: "💪" },
  { key: "legs", label: "Legs", icon: "🦵" },
  { key: "abs", label: "Abs", icon: "🔥" },
];

export const WORKOUTS: Record<MuscleCategory, Exercise[]> = {
  chest: [
    { name: "Barbell bench press", sets: "4 x 6-8", notes: "Main compound lift — control the eccentric." },
    { name: "Incline dumbbell press", sets: "3 x 8-10", notes: "Targets upper chest." },
    { name: "Cable flye", sets: "3 x 12-15", notes: "Squeeze at the midline for a full contraction." },
    { name: "Push-ups", sets: "3 x to near-failure", notes: "Great finisher, no equipment needed." },
    { name: "Dips (chest-leaning)", sets: "3 x 8-12", notes: "Lean forward to bias chest over triceps." },
  ],
  back: [
    { name: "Deadlift", sets: "4 x 5", notes: "Full posterior chain — prioritize form over load." },
    { name: "Pull-ups / lat pulldown", sets: "4 x 6-10", notes: "Focus on pulling with elbows, not hands." },
    { name: "Barbell row", sets: "3 x 8-10", notes: "Keep a flat back, pull to the lower ribs." },
    { name: "Seated cable row", sets: "3 x 10-12", notes: "Squeeze shoulder blades together at the end." },
    { name: "Face pulls", sets: "3 x 15", notes: "Rear delts + upper back health." },
  ],
  shoulders: [
    { name: "Overhead press", sets: "4 x 6-8", notes: "Main compound — brace your core." },
    { name: "Lateral raises", sets: "4 x 12-15", notes: "Light weight, strict form, no swinging." },
    { name: "Rear delt flye", sets: "3 x 12-15", notes: "Balances out front-delt-dominant pressing." },
    { name: "Arnold press", sets: "3 x 10", notes: "Hits all three delt heads through the rotation." },
    { name: "Upright row", sets: "3 x 10-12", notes: "Stop at shoulder height to protect the shoulder joint." },
  ],
  arms: [
    { name: "Barbell curl", sets: "4 x 8-10", notes: "Biceps — avoid swinging the torso." },
    { name: "Close-grip bench press", sets: "3 x 8-10", notes: "Triceps mass builder." },
    { name: "Hammer curl", sets: "3 x 10-12", notes: "Hits biceps + forearms." },
    { name: "Overhead tricep extension", sets: "3 x 10-12", notes: "Stretches the long head of the triceps." },
    { name: "Cable tricep pushdown", sets: "3 x 12-15", notes: "Keep elbows pinned to your sides." },
  ],
  legs: [
    { name: "Back squat", sets: "4 x 6-8", notes: "Main compound lift for quads/glutes." },
    { name: "Romanian deadlift", sets: "3 x 8-10", notes: "Hamstrings + glutes, keep a slight knee bend." },
    { name: "Leg press", sets: "3 x 10-12", notes: "Adjust foot placement to bias quads vs. glutes." },
    { name: "Walking lunges", sets: "3 x 12 each leg", notes: "Great unilateral quad/glute work." },
    { name: "Calf raises", sets: "4 x 15-20", notes: "Pause at the top for full contraction." },
  ],
  abs: [
    { name: "Hanging leg raise", sets: "3 x 10-15", notes: "Focus on curling the pelvis, not just swinging legs." },
    { name: "Cable crunch", sets: "3 x 12-15", notes: "Loadable ab exercise — go heavier over time." },
    { name: "Plank", sets: "3 x 45-60s", notes: "Keep hips level, brace like you're about to be punched." },
    { name: "Russian twists", sets: "3 x 20 total", notes: "Obliques — control the rotation, don't rush." },
    { name: "Ab wheel rollout", sets: "3 x 8-12", notes: "Advanced — keep your back flat, don't overextend." },
  ],
};
