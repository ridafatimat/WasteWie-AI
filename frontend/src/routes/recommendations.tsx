import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  ShoppingBasket,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { ErrorMessage } from "@/components/ErrorMessage";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  addGroceryListItem,
  addMealToGroceryList,
  completeGroceryList,
  deleteGroceryListItem,
  generateGroceryList,
  getActiveGroceryList,
  removeMealFromGroceryList,
  startGroceryShopping,
  updateGroceryListItem,
} from "@/services/api/grocery";
import { extractApiError } from "@/services/api/client";
import type {
  GroceryCategory,
  GroceryList,
  GroceryListItem,
  GroceryPriority,
} from "@/types/grocery";

export const Route = createFileRoute("/recommendations")({
  head: () => ({
    meta: [
      {
        title: "Grocery Ideas — WasteWise AI",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell title="Grocery Recommendations">
        <GroceryIdeasView />
      </AppShell>
    </RequireAuth>
  ),
});

const COVERAGE_OPTIONS = [7, 14, 30] as const;

const CATEGORIES: GroceryCategory[] = [
  "beverage",
  "dairy",
  "fruit",
  "grain",
  "meat",
  "snack",
  "vegetable",
  "other",
];

const PRIORITY_ORDER: GroceryPriority[] = [
  "buy_soon",
  "running_low",
  "planned_meal",
  "manual",
];

const PRIORITY_COPY: Record<
  GroceryPriority,
  {
    title: string;
    description: string;
    icon: typeof ShoppingBasket;
    badgeClass: string;
  }
> = {
  buy_soon: {
    title: "Buy soon",
    description: "Expected to run out before this shopping period ends.",
    icon: AlertTriangle,
    badgeClass: "bg-red-500/10 text-red-500",
  },
  running_low: {
    title: "Running low",
    description: "Useful top-ups based on household consumption.",
    icon: Clock3,
    badgeClass: "bg-amber-500/10 text-amber-500",
  },
  planned_meal: {
    title: "For planned meals",
    description: "Ingredient shortages added from your meal plans.",
    icon: ChefHat,
    badgeClass: "bg-violet-500/10 text-violet-400",
  },
  manual: {
    title: "Added manually",
    description: "Items you explicitly added to this list.",
    icon: Plus,
    badgeClass: "bg-primary/10 text-primary",
  },
};

function GroceryIdeasView() {
  const queryClient = useQueryClient();
  const activeListQuery = useQuery({
    queryKey: ["grocery-list", "active"],
    queryFn: getActiveGroceryList,
    retry: 0,
  });

  const [coverageDays, setCoverageDays] = useState("7");
  const [mealRequest, setMealRequest] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");
  const [manualUnit, setManualUnit] = useState("piece");
  const [manualCategory, setManualCategory] =
    useState<GroceryCategory>("other");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [editUnit, setEditUnit] = useState("");

  const refreshActiveList = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["grocery-list", "active"],
    });
  };

  const generateMutation = useMutation({
    mutationFn: (days: number) => generateGroceryList(days),
    onSuccess: async (list) => {
      queryClient.setQueryData(["grocery-list", "active"], list);
      setCoverageDays(String(list.coverage_days));
      toast.success("Grocery list generated");
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const mealMutation = useMutation({
    mutationFn: ({ listId, message }: { listId: string; message: string }) =>
      addMealToGroceryList(listId, message),
    onSuccess: (list) => {
      queryClient.setQueryData(["grocery-list", "active"], list);
      setMealRequest("");
      toast.success("Meal ingredients added to the list");
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const removeMealMutation = useMutation({
    mutationFn: ({ listId, mealId }: { listId: string; mealId: string }) =>
      removeMealFromGroceryList(listId, mealId),
    onSuccess: (list) => {
      queryClient.setQueryData(["grocery-list", "active"], list);
      toast.success("Meal removed");
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const addManualMutation = useMutation({
    mutationFn: ({
      listId,
      productName,
      quantity,
      unit,
      category,
    }: {
      listId: string;
      productName: string;
      quantity: number;
      unit: string;
      category: GroceryCategory;
    }) =>
      addGroceryListItem(listId, {
        product_name: productName,
        purchase_quantity: quantity,
        unit,
        category,
        selected: true,
      }),
    onSuccess: async () => {
      setManualName("");
      setManualQuantity("1");
      setManualUnit("piece");
      setManualCategory("other");
      await refreshActiveList();
      toast.success("Item added to grocery list");
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({
      listId,
      itemId,
      payload,
    }: {
      listId: string;
      itemId: string;
      payload: {
        purchase_quantity?: number;
        unit?: string;
        selected?: boolean;
      };
    }) => updateGroceryListItem(listId, itemId, payload),
    onSuccess: async () => {
      setEditingItemId(null);
      await refreshActiveList();
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) =>
      deleteGroceryListItem(listId, itemId),
    onSuccess: async () => {
      await refreshActiveList();
      toast.success("Item removed");
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const startShoppingMutation = useMutation({
    mutationFn: startGroceryShopping,
    onSuccess: (list) => {
      queryClient.setQueryData(["grocery-list", "active"], list);
      toast.success("Shopping mode started");
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const completeMutation = useMutation({
    mutationFn: completeGroceryList,
    onSuccess: async () => {
      await refreshActiveList();
      toast.success("Grocery list completed and moved to history");
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const list = activeListQuery.data;

  useEffect(() => {
    if (list) {
      setCoverageDays(String(list.coverage_days));
    }
  }, [list?.id, list?.coverage_days]);

  const groupedItems = useMemo(() => {
    const groups = new Map<GroceryPriority, GroceryListItem[]>();

    for (const priority of PRIORITY_ORDER) {
      groups.set(priority, []);
    }

    for (const item of list?.items ?? []) {
      groups.get(item.priority)?.push(item);
    }

    return groups;
  }, [list?.items]);

  const summary = useMemo(() => {
    const items = list?.items ?? [];
    return {
      total: items.length,
      selected: items.filter((item) => item.selected).length,
      purchased: items.filter((item) => item.is_purchased).length,
      meals: list?.meal_plans.length ?? 0,
    };
  }, [list]);

  const isBusy =
    generateMutation.isPending ||
    mealMutation.isPending ||
    addManualMutation.isPending ||
    updateItemMutation.isPending ||
    deleteItemMutation.isPending ||
    startShoppingMutation.isPending ||
    completeMutation.isPending;

  if (activeListQuery.isLoading) {
    return (
      <div className="grid min-h-[420px] place-items-center rounded-3xl border border-border bg-card">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading your grocery list…
          </p>
        </div>
      </div>
    );
  }

  if (activeListQuery.error) {
    return (
      <ErrorMessage
        message={extractApiError(activeListQuery.error)}
        onRetry={() => activeListQuery.refetch()}
      />
    );
  }

  if (!list) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Smart household planning
              </div>

              <h2 className="mt-5 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
                Build a grocery list from what your family actually needs
              </h2>

              <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
                WasteWise checks current pantry stock and household consumption
                history, then recommends only the quantity required for your
                selected shopping period.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <FeaturePill icon={PackageCheck} text="Checks pantry stock" />
                <FeaturePill icon={Clock3} text="Uses consumption rate" />
                <FeaturePill icon={ChefHat} text="Adds planned meals" />
              </div>
            </div>

            <div className="rounded-3xl border border-primary/15 bg-primary/5 p-5 sm:p-6">
              <p className="text-sm font-semibold">Plan for the next</p>
              <Select value={coverageDays} onValueChange={setCoverageDays}>
                <SelectTrigger className="mt-3 h-12 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COVERAGE_OPTIONS.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {days} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                type="button"
                className="mt-4 h-12 w-full bg-gradient-pink text-white shadow-glow"
                onClick={() => generateMutation.mutate(Number(coverageDays))}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <WandSparkles className="mr-2 h-4 w-4" />
                )}
                Generate grocery list
              </Button>

              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                WasteWise keeps one active list. Regenerating later updates that
                same draft instead of creating duplicates.
              </p>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={list.status} />
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(list.start_date)} – {formatDate(list.end_date)}
              </span>
            </div>

            <h2 className="mt-3 text-2xl font-bold tracking-tight">
              Your smart grocery list
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Calculated from pantry quantities, household consumption, and any
              meals you plan to cook.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={coverageDays}
              onValueChange={setCoverageDays}
              disabled={isBusy || list.status !== "draft"}
            >
              <SelectTrigger className="w-[125px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COVERAGE_OPTIONS.map((days) => (
                  <SelectItem key={days} value={String(days)}>
                    {days} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {list.status === "draft" && (
              <Button
                type="button"
                variant="outline"
                disabled={isBusy}
                onClick={() => generateMutation.mutate(Number(coverageDays))}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Regenerate
              </Button>
            )}

            {list.status === "draft" && (
              <Button
                type="button"
                className="bg-gradient-pink text-white"
                disabled={isBusy || summary.selected === 0}
                onClick={() => startShoppingMutation.mutate(list.id)}
              >
                <ShoppingBasket className="mr-2 h-4 w-4" />
                Start shopping
              </Button>
            )}

            {list.status === "shopping" && (
              <Button
                type="button"
                className="bg-gradient-pink text-white"
                disabled={isBusy}
                onClick={() => completeMutation.mutate(list.id)}
              >
                {completeMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Complete list
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="List items"
          value={summary.total}
          note={`${summary.selected} selected`}
          icon={ShoppingBasket}
        />
        <SummaryCard
          label="Buy soon"
          value={groupedItems.get("buy_soon")?.length ?? 0}
          note="Highest priority"
          icon={AlertTriangle}
        />
        <SummaryCard
          label="Planned meals"
          value={summary.meals}
          note="AI ingredient plans"
          icon={ChefHat}
        />
        <SummaryCard
          label="Purchased"
          value={summary.purchased}
          note={`of ${summary.total} items`}
          icon={CheckCircle2}
        />
      </div>

      {list.status === "draft" && (
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-400">
                <UtensilsCrossed className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Planning any meals?</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Write naturally. Groq will understand the dish, servings,
                  frequency and ingredients, then WasteWise will subtract what
                  is already in your pantry.
                </p>
              </div>
            </div>

            <textarea
              value={mealRequest}
              onChange={(event) => setMealRequest(event.target.value)}
              placeholder="Example: I plan to make chicken karahi twice this week for 5 people"
              rows={4}
              maxLength={500}
              className="mt-5 w-full resize-none rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Any cuisine or recipe can be entered.
              </p>
              <Button
                type="button"
                className="bg-gradient-pink text-white"
                disabled={
                  mealMutation.isPending || mealRequest.trim().length < 3
                }
                onClick={() =>
                  mealMutation.mutate({
                    listId: list.id,
                    message: mealRequest.trim(),
                  })
                }
              >
                {mealMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Add meal ingredients
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Add something manually</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manual items stay locked during regeneration.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Input
                value={manualName}
                onChange={(event) => setManualName(event.target.value)}
                placeholder="Product name"
                className="sm:col-span-2"
              />
              <Input
                value={manualQuantity}
                onChange={(event) => setManualQuantity(event.target.value)}
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Quantity"
              />
              <Input
                value={manualUnit}
                onChange={(event) => setManualUnit(event.target.value)}
                placeholder="Unit, e.g. kg"
              />
              <Select
                value={manualCategory}
                onValueChange={(value) =>
                  setManualCategory(value as GroceryCategory)
                }
              >
                <SelectTrigger className="sm:col-span-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((category) => (
                    <SelectItem key={category} value={category}>
                      {titleCase(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              disabled={
                addManualMutation.isPending ||
                !manualName.trim() ||
                !manualUnit.trim() ||
                Number(manualQuantity) <= 0
              }
              onClick={() =>
                addManualMutation.mutate({
                  listId: list.id,
                  productName: manualName.trim(),
                  quantity: Number(manualQuantity),
                  unit: manualUnit.trim(),
                  category: manualCategory,
                })
              }
            >
              {addManualMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Add item
            </Button>
          </div>
        </section>
      )}

      {list.meal_plans.length > 0 && (
        <section className="rounded-3xl border border-border bg-card p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-violet-400" />
            <h3 className="font-semibold">Planned meals</h3>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {list.meal_plans.map((meal) => (
              <article
                key={meal.id}
                className="rounded-2xl border border-border bg-background/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-semibold">{meal.dish_name}</h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {meal.servings} servings × {meal.times} time
                      {meal.times === 1 ? "" : "s"}
                    </p>
                  </div>

                  {list.status === "draft" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removeMealMutation.isPending}
                      onClick={() =>
                        removeMealMutation.mutate({
                          listId: list.id,
                          mealId: meal.id,
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>

                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {meal.original_request}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-400">
                    {meal.ingredients.length} ingredients
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                    {formatRecipeSource(meal.recipe_source)}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {list.items.length === 0 ? (
        <section className="grid min-h-[280px] place-items-center rounded-3xl border border-dashed border-border bg-card/50 p-8 text-center">
          <div>
            <ShoppingBasket className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">Nothing to buy yet</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Your pantry may already cover this period. Add a planned meal or a
              manual item, or choose a longer shopping period.
            </p>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
          {PRIORITY_ORDER.map((priority) => {
            const items = groupedItems.get(priority) ?? [];
            if (items.length === 0) return null;

            const copy = PRIORITY_COPY[priority];
            const Icon = copy.icon;

            return (
              <section
                key={priority}
                className="overflow-hidden rounded-3xl border border-border bg-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "grid h-9 w-9 place-items-center rounded-xl",
                        copy.badgeClass,
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{copy.title}</h3>
                      <p className="text-xs text-muted-foreground">
                        {copy.description}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="divide-y divide-border/70">
                  {items.map((item) => (
                    <GroceryItemRow
                      key={item.id}
                      item={item}
                      list={list}
                      editing={editingItemId === item.id}
                      editQuantity={editQuantity}
                      editUnit={editUnit}
                      setEditQuantity={setEditQuantity}
                      setEditUnit={setEditUnit}
                      onStartEdit={() => {
                        setEditingItemId(item.id);
                        setEditQuantity(String(item.purchase_quantity));
                        setEditUnit(item.unit);
                      }}
                      onCancelEdit={() => setEditingItemId(null)}
                      onSaveEdit={() => {
                        const quantity = Number(editQuantity);
                        if (!Number.isFinite(quantity) || quantity < 0) {
                          toast.error("Enter a valid quantity");
                          return;
                        }

                        if (!editUnit.trim()) {
                          toast.error("Enter a unit");
                          return;
                        }

                        updateItemMutation.mutate({
                          listId: list.id,
                          itemId: item.id,
                          payload: {
                            purchase_quantity: quantity,
                            unit: editUnit.trim(),
                          },
                        });
                      }}
                      onToggleSelected={() =>
                        updateItemMutation.mutate({
                          listId: list.id,
                          itemId: item.id,
                          payload: {
                            selected: !item.selected,
                          },
                        })
                      }
                      onDelete={() =>
                        deleteItemMutation.mutate({
                          listId: list.id,
                          itemId: item.id,
                        })
                      }
                      busy={isBusy}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GroceryItemRow({
  item,
  list,
  editing,
  editQuantity,
  editUnit,
  setEditQuantity,
  setEditUnit,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleSelected,
  onDelete,
  busy,
}: {
  item: GroceryListItem;
  list: GroceryList;
  editing: boolean;
  editQuantity: string;
  editUnit: string;
  setEditQuantity: (value: string) => void;
  setEditUnit: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onToggleSelected: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const canEdit = list.status === "draft";

  return (
    <article
      className={cn(
        "grid gap-4 px-5 py-4 transition sm:px-6 lg:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,0.8fr)_auto] lg:items-center",
        !item.selected && "opacity-55",
      )}
    >
      <button
        type="button"
        onClick={onToggleSelected}
        disabled={!canEdit || busy}
        className={cn(
          "grid h-6 w-6 place-items-center rounded-md border transition",
          item.selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background",
          (!canEdit || busy) && "cursor-not-allowed",
        )}
        aria-label={item.selected ? "Remove from shopping" : "Add to shopping"}
      >
        {item.selected && <Check className="h-4 w-4" />}
      </button>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="font-semibold">{item.product_name}</h4>
          <SourceBadge source={item.source_type} />
          {item.user_locked && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              <LockKeyhole className="h-3 w-3" />
              Locked
            </span>
          )}
          {item.is_purchased && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
              <CheckCircle2 className="h-3 w-3" />
              Purchased
            </span>
          )}
        </div>

        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {item.reason || "Recommended for this shopping period."}
        </p>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Pantry: {formatQuantity(item.pantry_quantity, item.unit)}</span>
          <span>
            Required: {formatQuantity(item.required_quantity, item.unit)}
          </span>
          {item.average_daily_consumption !== null && (
            <span>
              Daily use: {formatNumber(item.average_daily_consumption)}{" "}
              {item.unit}
            </span>
          )}
          {item.estimated_days_remaining !== null && (
            <span>
              About {formatNumber(item.estimated_days_remaining)} days left
            </span>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Buy
        </p>

        {editing ? (
          <div className="mt-1 flex items-center gap-2">
            <Input
              value={editQuantity}
              onChange={(event) => setEditQuantity(event.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="h-9 w-24"
            />
            <Input
              value={editUnit}
              onChange={(event) => setEditUnit(event.target.value)}
              className="h-9 w-24"
            />
          </div>
        ) : (
          <p className="mt-1 text-lg font-bold tabular-nums">
            {formatQuantity(item.purchase_quantity, item.unit)}
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-1">
        {editing ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={onCancelEdit}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-gradient-pink text-white"
              disabled={busy}
              onClick={onSaveEdit}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save
            </Button>
          </>
        ) : (
          <>
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={onStartEdit}
              >
                Edit
              </Button>
            )}
            {canEdit && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
                <span className="sr-only">Delete item</span>
              </Button>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function SummaryCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string;
  value: number;
  note: string;
  icon: typeof ShoppingBasket;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function FeaturePill({
  icon: Icon,
  text,
}: {
  icon: typeof ShoppingBasket;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-background/50 px-3 py-3 text-sm">
      <Icon className="h-4 w-4 text-primary" />
      <span>{text}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: GroceryList["status"] }) {
  const styles = {
    draft: "bg-primary/10 text-primary",
    shopping: "bg-amber-500/10 text-amber-500",
    completed: "bg-emerald-500/10 text-emerald-500",
  } as const;

  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        styles[status],
      )}
    >
      {titleCase(status)}
    </span>
  );
}

function SourceBadge({ source }: { source: GroceryListItem["source_type"] }) {
  const labels = {
    consumption: "Consumption",
    meal_plan: "Meal plan",
    combined: "Combined",
    manual: "Manual",
  } as const;

  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {labels[source]}
    </span>
  );
}

function formatDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(quantity: number, unit: string) {
  return `${formatNumber(quantity)} ${unit}`.trim();
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatRecipeSource(value: string) {
  if (!value) return "AI recipe";
  return titleCase(value);
}