export type RecipeUrgency =
  | "today"
  | "tomorrow"
  | "day_after_tomorrow";

export type RecipeDifficulty =
  | "easy"
  | "medium";

export type RecipeSuggestionRequest = {
  servings: number;
  recipe_count: number;
  cuisine?: string;
  dietary_preferences?: string;
};

export type UrgentPantryItem = {
  pantry_item_id: string;
  product_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  expiry_date: string;
  days_until_expiry: number;
  urgency: RecipeUrgency;
};

export type RecipeIngredient = {
  name: string;
  quantity: number | null;
  unit: string | null;
  from_urgent_pantry: boolean;
  pantry_item_name: string | null;
};

export type ExpiryRescueRecipe = {
  title: string;
  description: string;
  servings: number;
  prep_minutes: number;
  cook_minutes: number;
  difficulty: RecipeDifficulty;
  used_urgent_items: string[];
  ingredients: RecipeIngredient[];
  steps: string[];
  missing_ingredients: string[];
  waste_reduction_tip: string;
};

export type RecipeSuggestionResponse = {
  generated_at: string;
  model: string;
  date_window_start: string;
  date_window_end: string;
  urgent_items: UrgentPantryItem[];
  recipes: ExpiryRescueRecipe[];
  message: string;
  safety_note: string;
};