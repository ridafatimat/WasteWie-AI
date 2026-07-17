export type GroceryListStatus = "draft" | "shopping" | "completed";

export type GroceryPriority =
  "buy_soon" | "running_low" | "planned_meal" | "manual";

export type GrocerySource = "consumption" | "meal_plan" | "combined" | "manual";

export type GroceryCategory =
  | "beverage"
  | "dairy"
  | "fruit"
  | "grain"
  | "meat"
  | "snack"
  | "vegetable"
  | "other";

export type GroceryListItem = {
  id: string;
  product_name: string;
  category: string | null;
  required_quantity: number;
  pantry_quantity: number;
  purchase_quantity: number;
  purchased_quantity: number;
  average_daily_consumption: number | null;
  estimated_days_remaining: number | null;
  unit: string;
  priority: GroceryPriority;
  source_type: GrocerySource;
  reason: string | null;
  selected: boolean;
  user_locked: boolean;
  is_purchased: boolean;
  source_breakdown: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type MealPlan = {
  id: string;
  original_request: string;
  dish_name: string;
  servings: number;
  times: number;
  recipe_source: string;
  ingredients: Array<Record<string, unknown>>;
  assumptions: string[];
  created_at: string;
};

export type GroceryList = {
  id: string;
  coverage_days: number;
  start_date: string;
  end_date: string;
  status: GroceryListStatus;
  generated_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  items: GroceryListItem[];
  meal_plans: MealPlan[];
};

export type GroceryListHistoryItem = Omit<
  GroceryList,
  "generated_at" | "updated_at"
>;

export type GroceryListItemCreate = {
  product_name: string;
  purchase_quantity: number;
  unit: string;
  category: GroceryCategory;
  selected?: boolean;
};

export type GroceryListItemUpdate = {
  product_name?: string;
  purchase_quantity?: number;
  unit?: string;
  category?: GroceryCategory;
  selected?: boolean;
  user_locked?: boolean;
};