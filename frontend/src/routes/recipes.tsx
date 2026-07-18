import {
  createFileRoute,
} from "@tanstack/react-router";
import {
  useMutation,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ChefHat,
  Check,
  Clock3,
  Copy,
  Flame,
  Leaf,
  Loader2,
  Package,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  TimerReset,
  UtensilsCrossed,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  motion,
} from "framer-motion";
import {
  toast,
} from "sonner";

import {
  RequireAuth,
} from "@/components/RequireAuth";
import {
  AppShell,
} from "@/components/AppShell";
import {
  Button,
} from "@/components/ui/button";
import {
  Input,
} from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ErrorMessage,
} from "@/components/ErrorMessage";
import {
  extractApiError,
} from "@/services/api/client";
import {
  getRecipeRecommendations,
} from "@/services/api";
import {
  cn,
} from "@/lib/utils";
import type {
  ExpiryRescueRecipe,
  RecipeUrgency,
  UrgentPantryItem,
} from "@/types/recipe";


export const Route =
  createFileRoute("/recipes")({
    head: () => ({
      meta: [
        {
          title:
            "Recipes — WasteWise AI",
        },
      ],
    }),

    component: () => (
      <RequireAuth>
        <AppShell title="Recipe Suggestions">
          <RecipeSuggestionsView />
        </AppShell>
      </RequireAuth>
    ),
  });


const URGENCY_DETAILS: Record<
  RecipeUrgency,
  {
    label: string;
    className: string;
  }
> = {
  today: {
    label: "Expires today",
    className:
      "border-red-500/30 bg-red-500/10 text-red-400",
  },

  tomorrow: {
    label: "Expires tomorrow",
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-400",
  },

  day_after_tomorrow: {
    label: "Expires in 2 days",
    className:
      "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  },
};


function RecipeSuggestionsView() {
  const [servings, setServings] = useState("4");
  const [recipeCount, setRecipeCount] = useState("3");
  const [cuisine, setCuisine] = useState("");
  const [dietaryPreferences, setDietaryPreferences] = useState("");

  const recipeMutation = useMutation({
    mutationFn: () =>
      getRecipeRecommendations({
        servings: Number(servings),
        recipe_count: Number(recipeCount),
        cuisine: cuisine.trim() || undefined,
        dietary_preferences: dietaryPreferences.trim() || undefined,
      }),

    onSuccess: (response) => {
      if (response.recipes.length > 0) {
        toast.success("Expiry rescue recipes generated");
      } else {
        toast.info(response.message);
      }
    },

    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const data = recipeMutation.data;

  const urgentCounts = useMemo(() => {
    const counts = {
      today: 0,
      tomorrow: 0,
      day_after_tomorrow: 0,
    };

    for (const item of data?.urgent_items ?? []) {
      counts[item.urgency] += 1;
    }

    return counts;
  }, [data?.urgent_items]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[32px] border border-primary/20 bg-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(255,46,139,0.18),transparent_34%),radial-gradient(circle_at_88%_100%,rgba(138,43,226,0.12),transparent_32%)]" />
        <div className="pointer-events-none absolute -left-20 top-24 h-52 w-52 rounded-full border border-primary/10" />
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-primary/[0.05] blur-3xl" />

        <div className="relative grid gap-8 p-6 sm:p-8 xl:grid-cols-[1.15fr_0.85fr] xl:p-10">
          <div className="flex flex-col justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <ChefHat className="h-3.5 w-3.5" />
                Expiry rescue kitchen
              </div>

              <h2 className="mt-5 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl xl:text-[42px] xl:leading-[1.08]">
                Turn urgent pantry items into your next great meal.
              </h2>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                WasteWise prioritises usable food expiring today and over the next two days, then asks Groq for practical recipes shaped around your preferences.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <FeaturePill
                icon={CalendarClock}
                eyebrow="Priority window"
                text="Today + next 2 days"
              />
              <FeaturePill
                icon={Package}
                eyebrow="Pantry aware"
                text="Uses exact item names"
              />
              <FeaturePill
                icon={Sparkles}
                eyebrow="AI planning"
                text="Powered by Groq"
              />
            </div>
          </div>

          <div className="rounded-[26px] border border-white/10 bg-background/75 p-4 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold">Recipe preferences</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Set the portions and style of food you want.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                Flexible
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Servings">
                <Select value={servings} onValueChange={setServings}>
                  <SelectTrigger className="h-11 bg-card/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 4, 6, 8].map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value} servings
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Number of recipes">
                <Select value={recipeCount} onValueChange={setRecipeCount}>
                  <SelectTrigger className="h-11 bg-card/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {value} recipe{value === 1 ? "" : "s"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Cuisine (optional)">
                <Input
                  value={cuisine}
                  onChange={(event) => setCuisine(event.target.value)}
                  placeholder="Pakistani, Italian..."
                  maxLength={80}
                  className="h-11 bg-card/70"
                />
              </Field>

              <Field label="Dietary preference">
                <Input
                  value={dietaryPreferences}
                  onChange={(event) => setDietaryPreferences(event.target.value)}
                  placeholder="Halal, vegetarian..."
                  maxLength={160}
                  className="h-11 bg-card/70"
                />
              </Field>
            </div>

            <Button
              type="button"
              className="mt-5 h-12 w-full bg-gradient-pink text-white shadow-glow transition hover:-translate-y-0.5"
              disabled={recipeMutation.isPending}
              onClick={() => recipeMutation.mutate()}
            >
              {recipeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : data ? (
                <RefreshCw className="mr-2 h-4 w-4" />
              ) : (
                <WandSparkles className="mr-2 h-4 w-4" />
              )}

              {recipeMutation.isPending
                ? "Building rescue recipes..."
                : data
                  ? "Regenerate recipes"
                  : "Suggest recipes"}
            </Button>
          </div>
        </div>
      </motion.section>

      {!data && !recipeMutation.isPending && (
        <section className="grid gap-4 md:grid-cols-3">
          <WorkflowCard
            number="01"
            icon={Flame}
            title="Find urgent food"
            description="Only usable pantry items expiring today or within the next two days are prioritised."
          />
          <WorkflowCard
            number="02"
            icon={Sparkles}
            title="Build practical recipes"
            description="Groq receives your servings, cuisine and dietary preferences together with the urgent stock."
          />
          <WorkflowCard
            number="03"
            icon={Leaf}
            title="Reduce avoidable waste"
            description="Every suggestion highlights which urgent ingredients it uses and what else may be needed."
          />
        </section>
      )}

      {recipeMutation.error && (
        <ErrorMessage
          message={extractApiError(recipeMutation.error)}
          onRetry={() => recipeMutation.mutate()}
        />
      )}

      {recipeMutation.isPending && <RecipeLoadingState />}

      {data && !recipeMutation.isPending && (
        <>
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="overflow-hidden rounded-[28px] border border-border bg-card"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 bg-gradient-to-r from-primary/[0.08] via-transparent to-transparent px-5 py-5 sm:px-6">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  <TimerReset className="h-4 w-4" />
                  Rescue queue
                </div>
                <h3 className="mt-2 text-xl font-bold">Ingredients to use first</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Usable products expiring between {formatDate(data.date_window_start)} and {formatDate(data.date_window_end)}.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <CountBadge label="Today" value={urgentCounts.today} className="border-red-500/25 bg-red-500/10 text-red-400" />
                <CountBadge label="Tomorrow" value={urgentCounts.tomorrow} className="border-amber-500/25 bg-amber-500/10 text-amber-400" />
                <CountBadge label="In 2 days" value={urgentCounts.day_after_tomorrow} className="border-yellow-500/25 bg-yellow-500/10 text-yellow-300" />
              </div>
            </div>

            {data.urgent_items.length === 0 ? (
              <div className="m-5 grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-border bg-background/25 px-6 text-center sm:m-6">
                <div>
                  <BadgeCheck className="mx-auto h-10 w-10 text-emerald-400" />
                  <h4 className="mt-4 font-semibold">Nothing urgent to cook</h4>
                  <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                    No active pantry item with remaining quantity expires today, tomorrow, or the day after tomorrow.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3 sm:p-6">
                {data.urgent_items.map((item, index) => (
                  <UrgentItemCard
                    key={`${item.pantry_item_id}-${item.unit}`}
                    item={item}
                    index={index}
                  />
                ))}
              </div>
            )}
          </motion.section>

          {data.recipes.length > 0 && (
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Your rescue menu</p>
                  <h3 className="mt-1 text-xl font-bold">Recipe suggestions</h3>
                </div>
                <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">
                  {data.recipes.length} recipe{data.recipes.length === 1 ? "" : "s"} generated
                </span>
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                {data.recipes.map((recipe, index) => (
                  <RecipeCard
                    key={`${recipe.title}-${index}`}
                    recipe={recipe}
                    index={index}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.08] to-transparent px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-400">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-amber-200">Food-safety reminder</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{data.safety_note}</p>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function UrgentItemCard({
  item,
  index,
}: {
  item: UrgentPantryItem;
  index: number;
}) {
  const urgency = URGENCY_DETAILS[item.urgency];

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-background/45 p-4 transition hover:-translate-y-0.5 hover:border-primary/30"
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-fuchsia-500 opacity-70" />
      <div className="flex items-start justify-between gap-3 pl-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-semibold">{item.product_name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatQuantity(item.quantity, item.unit)} available
              </p>
            </div>
          </div>
        </div>

        <span className={cn(
          "shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
          urgency.className,
        )}>
          {urgency.label}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-card/60 px-3 py-2 text-xs">
        <span className="text-muted-foreground">Recorded expiry</span>
        <span className="font-medium">{formatDate(item.expiry_date)}</span>
      </div>
    </motion.article>
  );
}

function RecipeCard({
  recipe,
  index,
}: {
  recipe: ExpiryRescueRecipe;
  index: number;
}) {
  const totalMinutes = recipe.prep_minutes + recipe.cook_minutes;

  const copyRecipe = async () => {
    const ingredients = recipe.ingredients
      .map((ingredient) => {
        const quantity = ingredient.quantity === null
          ? ""
          : `${formatNumber(ingredient.quantity)} `;
        const unit = ingredient.unit ? `${ingredient.unit} ` : "";
        return `• ${quantity}${unit}${ingredient.name}`;
      })
      .join("\n");

    const steps = recipe.steps
      .map((step, stepIndex) => `${stepIndex + 1}. ${step}`)
      .join("\n");

    const recipeText = `${recipe.title}\n\n${recipe.description}\n\nIngredients\n${ingredients}\n\nMethod\n${steps}`;

    try {
      await navigator.clipboard.writeText(recipeText);
      toast.success("Recipe copied");
    } catch {
      toast.error("Could not copy the recipe");
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06 }}
      className="group overflow-hidden rounded-[28px] border border-border bg-card transition hover:border-primary/25 hover:shadow-2xl hover:shadow-black/15"
    >
      <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-primary/[0.12] via-card to-card p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full border border-primary/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-pink text-white shadow-glow">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                Rescue recipe {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-1 text-xl font-bold leading-tight">{recipe.title}</h3>
            </div>
          </div>

          <Button type="button" size="sm" variant="outline" className="bg-background/60" onClick={copyRecipe}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </Button>
        </div>

        <p className="relative mt-4 text-sm leading-6 text-muted-foreground">
          {recipe.description}
        </p>

        <div className="relative mt-4 flex flex-wrap gap-2">
          <MetaPill icon={Clock3} text={`${totalMinutes} min`} />
          <MetaPill icon={UtensilsCrossed} text={`${recipe.servings} servings`} />
          <MetaPill icon={Check} text={titleCase(recipe.difficulty)} />
        </div>

        {recipe.used_urgent_items.length > 0 && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {recipe.used_urgent_items.map((name) => (
              <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                <Flame className="h-3 w-3" />
                Uses {name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Ingredients</h4>
            <span className="text-[11px] text-muted-foreground">{recipe.ingredients.length} items</span>
          </div>

          <ul className="mt-3 space-y-2">
            {recipe.ingredients.map((ingredient, ingredientIndex) => (
              <li
                key={`${ingredient.name}-${ingredientIndex}`}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm",
                  ingredient.from_urgent_pantry
                    ? "border-primary/20 bg-primary/[0.06]"
                    : "border-border/70 bg-background/30",
                )}
              >
                <span className={cn(
                  "mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                  ingredient.from_urgent_pantry
                    ? "bg-primary text-white"
                    : "bg-muted text-muted-foreground",
                )}>
                  <Check className="h-3 w-3" />
                </span>
                <span className="leading-5">
                  {ingredient.quantity !== null && <>{formatNumber(ingredient.quantity)} </>}
                  {ingredient.unit && `${ingredient.unit} `}
                  {ingredient.name}
                </span>
              </li>
            ))}
          </ul>

          {recipe.missing_ingredients.length > 0 && (
            <div className="mt-4 rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-400">You may need</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {recipe.missing_ingredients.join(", ")}
              </p>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Method</h4>
            <span className="text-[11px] text-muted-foreground">{recipe.steps.length} steps</span>
          </div>

          <ol className="mt-3 space-y-3">
            {recipe.steps.map((step, stepIndex) => (
              <li key={`${step}-${stepIndex}`} className="flex gap-3 text-sm leading-6">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-xs font-semibold text-primary">
                  {stepIndex + 1}
                </span>
                <span className="pt-0.5 text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="border-t border-border bg-gradient-to-r from-emerald-500/[0.06] to-transparent px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <Leaf className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-400">WasteWise tip</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{recipe.waste_reduction_tip}</p>
          </div>
        </div>
      </div>
    </motion.article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function FeaturePill({
  icon: Icon,
  eyebrow,
  text,
}: {
  icon: LucideIcon;
  eyebrow: string;
  text: string;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-2xl border border-border/80 bg-background/45 px-3.5 py-3 transition hover:border-primary/25 hover:bg-primary/[0.04]">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        <p className="mt-0.5 truncate text-xs font-medium sm:text-sm">{text}</p>
      </div>
    </div>
  );
}

function WorkflowCard({
  number,
  icon: Icon,
  title,
  description,
}: {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 transition hover:-translate-y-1 hover:border-primary/25"
    >
      <div className="absolute right-4 top-3 text-4xl font-black text-foreground/[0.035]">{number}</div>
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-5 font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mt-4 flex items-center gap-1.5 text-xs font-medium text-primary">
        Built into WasteWise
        <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
      </div>
    </motion.article>
  );
}

function MetaPill({
  icon: Icon,
  text,
}: {
  icon: LucideIcon;
  text: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/55 px-2.5 py-1 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" />
      {text}
    </span>
  );
}

function CountBadge({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <span className={cn("rounded-full border px-2.5 py-1 font-semibold", className)}>
      {label}: {value}
    </span>
  );
}

function RecipeLoadingState() {
  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-primary/15 bg-primary/[0.04] p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div>
            <p className="font-semibold">Building your rescue menu</p>
            <p className="mt-1 text-xs text-muted-foreground">Checking urgent pantry stock and shaping practical recipes.</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full rounded-full bg-gradient-pink"
            initial={{ width: "12%" }}
            animate={{ width: ["12%", "82%", "45%", "92%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-[520px] animate-pulse rounded-[28px] border border-border bg-card/60" />
        ))}
      </div>
    </div>
  );
}

function formatDate(
  value: string,
) {
  const parsed = new Date(
    `${value}T00:00:00`,
  );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    undefined,
    {
      day: "numeric",
      month: "short",
      year: "numeric",
    },
  ).format(parsed);
}


function formatNumber(
  value: number,
) {
  return new Intl.NumberFormat(
    undefined,
    {
      maximumFractionDigits: 2,
    },
  ).format(value);
}


function formatQuantity(
  quantity: number,
  unit: string,
) {
  return `${formatNumber(
    quantity,
  )} ${unit}`.trim();
}


function titleCase(
  value: string,
) {
  return value
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (letter) =>
        letter.toUpperCase(),
    );
}