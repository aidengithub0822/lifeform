import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST: quick-log a saved recipe as a meal (adds a food_logs row using the recipe's macros).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: recipe, error: recipeError } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (recipeError || !recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const { error } = await supabase.from("food_logs").insert({
    user_id: user.id,
    food_name: recipe.name,
    description: `From saved recipe (1 serving of ${recipe.servings})`,
    calories: Math.round(recipe.calories / recipe.servings),
    protein_g: recipe.protein_g / recipe.servings,
    carbs_g: recipe.carbs_g / recipe.servings,
    fat_g: recipe.fat_g / recipe.servings,
    score: 75,
    score_reason: "Logged from a saved recipe rather than a fresh scan.",
    source: "recipe",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
