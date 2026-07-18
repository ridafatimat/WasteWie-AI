import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChefHat,
  Clock3,
  Download,
  Gauge,
  Layers3,
  ListChecks,
  Loader2,
  LockKeyhole,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  WandSparkles,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
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
  markGroceryListItemPurchased,
  returnGroceryListToDraft,
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

  const returnToDraftMutation = useMutation({
    mutationFn: returnGroceryListToDraft,
    onSuccess: async (updatedList) => {
      queryClient.setQueryData(
        ["grocery-list", "active"],
        updatedList,
      );

      await queryClient.invalidateQueries({
        queryKey: ["pantry"],
      });

      toast.success("Returned to planning mode");
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const purchaseItemMutation = useMutation({
    mutationFn: ({
      listId,
      itemId,
    }: {
      listId: string;
      itemId: string;
    }) => markGroceryListItemPurchased(listId, itemId),
    onSuccess: async (updatedList) => {
      queryClient.setQueryData(
        ["grocery-list", "active"],
        updatedList,
      );

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["pantry"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["risks"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["rescue-mode"],
        }),
      ]);

      toast.success("Item added to Smart Pantry");
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

  const visibleItems = useMemo(
    () =>
      (list?.items ?? []).filter(
        (item) =>
          !item.is_purchased &&
          Number(item.purchase_quantity) > 0,
      ),
    [list?.items],
  );

  const groupedItems = useMemo(() => {
    const groups = new Map<GroceryPriority, GroceryListItem[]>();

    for (const priority of PRIORITY_ORDER) {
      groups.set(priority, []);
    }

    for (const item of visibleItems) {
      groups.get(item.priority)?.push(item);
    }

    return groups;
  }, [visibleItems]);

  const selectedShoppingItems = useMemo(
    () =>
      (list?.items ?? []).filter(
        (item) =>
          item.selected &&
          Number(item.purchase_quantity) > 0,
      ),
    [list?.items],
  );

  const remainingSelectedItemCount = selectedShoppingItems.filter(
    (item) => !item.is_purchased,
  ).length;

  const allSelectedItemsPurchased =
    selectedShoppingItems.length > 0 &&
    selectedShoppingItems.every(
      (item) => item.is_purchased,
    );

  const purchasedItemCount = selectedShoppingItems.filter(
    (item) => item.is_purchased,
  ).length;

  const shoppingProgress =
    selectedShoppingItems.length > 0
      ? Math.round(
          (purchasedItemCount / selectedShoppingItems.length) * 100,
        )
      : 0;

  const activePriorityCount = PRIORITY_ORDER.filter(
    (priority) => (groupedItems.get(priority)?.length ?? 0) > 0,
  ).length;

  const isBusy =
    generateMutation.isPending ||
    mealMutation.isPending ||
    addManualMutation.isPending ||
    updateItemMutation.isPending ||
    deleteItemMutation.isPending ||
    startShoppingMutation.isPending ||
    returnToDraftMutation.isPending ||
    purchaseItemMutation.isPending ||
    completeMutation.isPending;

  if (activeListQuery.isLoading) {
    return (
      <div className="relative grid min-h-[520px] overflow-hidden rounded-[2rem] border border-border/70 bg-card place-items-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,hsl(var(--primary)/0.16),transparent_35%),radial-gradient(circle_at_85%_82%,hsl(var(--primary)/0.08),transparent_35%)]" />
        <div className="relative text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-primary/20 bg-primary/10 shadow-glow">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
          </div>
          <p className="mt-5 font-semibold">Preparing your grocery plan</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Checking pantry stock and household consumption…
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
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-[0_24px_80px_-36px_hsl(var(--primary)/0.45)]">
          <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-36 right-0 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-3xl" />

          <div className="relative grid gap-10 p-6 sm:p-9 lg:grid-cols-[1.15fr_0.85fr] lg:p-12">
            <div className="flex flex-col justify-center">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                Smart household planning
              </div>

              <h2 className="mt-6 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl sm:leading-[1.08]">
                Shop for what you need,
                <span className="block bg-gradient-to-r from-primary via-pink-400 to-fuchsia-400 bg-clip-text text-transparent">
                  not what you already have.
                </span>
              </h2>

              <p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
                WasteWise compares your active pantry stock with household usage
                and planned meals, then calculates a practical shopping list for
                the period you choose.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <FeaturePill icon={PackageCheck} text="Checks pantry stock" />
                <FeaturePill icon={Gauge} text="Uses consumption pace" />
                <FeaturePill icon={ChefHat} text="Includes planned meals" />
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="relative rounded-[1.75rem] border border-primary/20 bg-background/70 p-5 shadow-2xl backdrop-blur-xl sm:p-7"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-pink text-white shadow-glow">
                  <WandSparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">Create your first smart list</p>
                  <p className="text-xs text-muted-foreground">
                    Choose how long this shop should cover.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-border/70 bg-card/70 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Shopping coverage
                </p>
                <Select value={coverageDays} onValueChange={setCoverageDays}>
                  <SelectTrigger className="mt-3 h-12 rounded-xl bg-background">
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
              </div>

              <Button
                type="button"
                className="mt-4 h-12 w-full rounded-xl bg-gradient-pink text-white shadow-glow transition hover:-translate-y-0.5"
                onClick={() => generateMutation.mutate(Number(coverageDays))}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Generate smart grocery list
              </Button>

              <div className="mt-5 flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/25 p-4">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-xs leading-5 text-muted-foreground">
                  WasteWise keeps one active list. Regenerating updates the same
                  draft, so you never get duplicate shopping plans.
                </p>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 sm:space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-[0_24px_80px_-42px_hsl(var(--primary)/0.5)]">
        <div className="pointer-events-none absolute -left-24 -top-32 h-72 w-72 rounded-full bg-primary/18 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-8 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-3xl" />

        <div className="relative p-5 sm:p-7">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px] xl:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={list.status} />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/45 px-3 py-1 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  {formatDate(list.start_date)} – {formatDate(list.end_date)}
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-4xl">
                {list.status === "shopping"
                  ? "Your shopping run is active"
                  : "Your smart grocery list"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {list.status === "shopping"
                  ? "Tick each item as you buy it. Every purchased item is immediately added to Smart Pantry."
                  : "Built from pantry quantities, household consumption, and the meals you plan to cook."}
              </p>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/55 p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    {list.status === "shopping" ? "Shopping progress" : "Selected to buy"}
                  </p>
                  <p className="mt-1 text-2xl font-black tabular-nums">
                    {list.status === "shopping"
                      ? `${purchasedItemCount}/${selectedShoppingItems.length}`
                      : remainingSelectedItemCount}
                  </p>
                </div>
                <div
                  className="grid h-16 w-16 place-items-center rounded-full p-1"
                  style={{
                    background: `conic-gradient(hsl(var(--primary)) ${
                      list.status === "shopping" ? shoppingProgress : 100
                    }%, hsl(var(--muted)) 0)`,
                  }}
                >
                  <div className="grid h-full w-full place-items-center rounded-full bg-card text-xs font-bold">
                    {list.status === "shopping"
                      ? `${shoppingProgress}%`
                      : `${list.coverage_days}d`}
                  </div>
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{
                    width: `${
                      list.status === "shopping" ? shoppingProgress : 100
                    }%`,
                  }}
                  transition={{ duration: 0.45 }}
                  className="h-full rounded-full bg-gradient-pink"
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {list.status === "shopping"
                  ? `${remainingSelectedItemCount} item${remainingSelectedItemCount === 1 ? "" : "s"} left to purchase.`
                  : `${activePriorityCount} recommendation group${activePriorityCount === 1 ? "" : "s"} across a ${list.coverage_days}-day plan.`}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={ShoppingCart}
              label="Remaining"
              value={remainingSelectedItemCount}
              note="Selected items still to buy"
              tone="primary"
            />
            <MetricCard
              icon={Layers3}
              label="Recommendations"
              value={visibleItems.length}
              note="Visible items on this list"
              tone="default"
            />
            <MetricCard
              icon={CheckCircle2}
              label="Purchased"
              value={purchasedItemCount}
              note="Already added to Smart Pantry"
              tone="success"
            />
            <MetricCard
              icon={CalendarDays}
              label="Coverage"
              value={`${list.coverage_days} days`}
              note="Current shopping period"
              tone="warning"
            />
          </div>
        </div>

        <div className="relative border-t border-border/70 bg-background/30 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={coverageDays}
              onValueChange={setCoverageDays}
              disabled={isBusy || list.status !== "draft"}
            >
              <SelectTrigger className="h-10 w-[130px] rounded-xl bg-card/80">
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
                className="rounded-xl"
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

            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={isBusy || remainingSelectedItemCount === 0}
              onClick={() => {
                try {
                  downloadGroceryListPdf(list);
                  toast.success("Grocery list PDF downloaded");
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Could not download the grocery list PDF",
                  );
                }
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>

            {list.status === "draft" && (
              <Button
                type="button"
                className="rounded-xl bg-gradient-pink text-white shadow-glow"
                disabled={isBusy || remainingSelectedItemCount === 0}
                onClick={() => startShoppingMutation.mutate(list.id)}
              >
                {startShoppingMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShoppingBasket className="mr-2 h-4 w-4" />
                )}
                Start shopping
              </Button>
            )}

            {list.status === "shopping" && (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={isBusy}
                onClick={() => returnToDraftMutation.mutate(list.id)}
              >
                {returnToDraftMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArrowLeft className="mr-2 h-4 w-4" />
                )}
                Back to planning
              </Button>
            )}

            {list.status === "shopping" && (
              <Button
                type="button"
                className="rounded-xl bg-gradient-pink text-white shadow-glow"
                disabled={isBusy || !allSelectedItemsPurchased}
                title={
                  allSelectedItemsPurchased
                    ? "Complete this grocery list"
                    : "Tick every bought item before completing the list"
                }
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

      {visibleItems.length === 0 ? (
        <section className="relative grid min-h-[320px] place-items-center overflow-hidden rounded-[2rem] border border-dashed border-border bg-card/60 p-8 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.08),transparent_48%)]" />
          <div className="relative max-w-lg">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl border border-border bg-background/70">
              {allSelectedItemsPurchased ? (
                <CheckCircle2 className="h-7 w-7 text-emerald-500" />
              ) : (
                <ShoppingBasket className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <h3 className="mt-5 text-lg font-bold">
              {allSelectedItemsPurchased
                ? "Everything has been purchased"
                : "Nothing to buy yet"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {allSelectedItemsPurchased
                ? "Purchased items were added to Smart Pantry and removed from this active view. Complete the list whenever you are ready."
                : "Your pantry may already cover this period. Add a planned meal, add an item manually, or choose a longer shopping period."}
            </p>
          </div>
        </section>
      ) : (
        <div className="space-y-5">
          {PRIORITY_ORDER.map((priority, priorityIndex) => {
            const items = groupedItems.get(priority) ?? [];
            if (items.length === 0) return null;

            const copy = PRIORITY_COPY[priority];
            const Icon = copy.icon;

            return (
              <motion.section
                key={priority}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: priorityIndex * 0.04 }}
                className="overflow-hidden rounded-[2rem] border border-border/70 bg-card shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/25 px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "grid h-11 w-11 place-items-center rounded-2xl border border-current/10",
                        copy.badgeClass,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold">{copy.title}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {copy.description}
                      </p>
                    </div>
                  </div>

                  <span className="rounded-full border border-border/70 bg-card px-3 py-1 text-xs text-muted-foreground">
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="grid gap-3 p-3 sm:p-4 xl:grid-cols-2">
                  {items.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.025 }}
                    >
                      <GroceryItemRow
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
                        onMarkPurchased={() =>
                          purchaseItemMutation.mutate({
                            listId: list.id,
                            itemId: item.id,
                          })
                        }
                        onDelete={() =>
                          deleteItemMutation.mutate({
                            listId: list.id,
                            itemId: item.id,
                          })
                        }
                        purchasing={
                          purchaseItemMutation.isPending &&
                          purchaseItemMutation.variables?.itemId === item.id
                        }
                        busy={isBusy}
                      />
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            );
          })}
        </div>
      )}

      {list.status === "draft" && (
        <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/25 px-5 py-4 sm:px-6">
            <div>
              <div className="flex items-center gap-2 text-primary">
                <Zap className="h-4 w-4" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em]">
                  Planning studio
                </span>
              </div>
              <h3 className="mt-2 text-lg font-bold">Shape the list around your week</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a meal request or include something manually without losing the smart recommendations.
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="relative overflow-hidden rounded-3xl border border-violet-500/20 bg-violet-500/[0.035] p-5 sm:p-6">
              <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-violet-500/10 blur-3xl" />
              <div className="relative flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-500/10 text-violet-400">
                  <UtensilsCrossed className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold">Planning any meals?</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Describe the dish, servings and frequency. WasteWise adds only the missing ingredients.
                  </p>
                </div>
              </div>

              <textarea
                value={mealRequest}
                onChange={(event) => setMealRequest(event.target.value)}
                placeholder="Example: Chicken karahi twice this week for 5 people"
                rows={4}
                maxLength={500}
                className="relative mt-5 w-full resize-none rounded-2xl border border-input bg-background/80 px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
              />

              <div className="relative mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {mealRequest.length}/500 characters
                </p>
                <Button
                  type="button"
                  className="rounded-xl bg-gradient-pink text-white shadow-glow"
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

            <div className="rounded-3xl border border-primary/15 bg-primary/[0.025] p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold">Add something manually</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Manual items remain locked during regeneration.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Input
                  value={manualName}
                  onChange={(event) => setManualName(event.target.value)}
                  placeholder="Product name"
                  className="h-11 rounded-xl bg-background/80 sm:col-span-2"
                />
                <Input
                  value={manualQuantity}
                  onChange={(event) => setManualQuantity(event.target.value)}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Quantity"
                  className="h-11 rounded-xl bg-background/80"
                />
                <Input
                  value={manualUnit}
                  onChange={(event) => setManualUnit(event.target.value)}
                  placeholder="Unit, e.g. kg"
                  className="h-11 rounded-xl bg-background/80"
                />
                <Select
                  value={manualCategory}
                  onValueChange={(value) =>
                    setManualCategory(value as GroceryCategory)
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl bg-background/80 sm:col-span-2">
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
                className="mt-3 h-11 w-full rounded-xl border-primary/25 bg-primary/5 hover:bg-primary/10"
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
                Add item to list
              </Button>
            </div>
          </div>
        </section>
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
  onMarkPurchased,
  onDelete,
  purchasing,
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
  onMarkPurchased: () => void;
  onDelete: () => void;
  purchasing: boolean;
  busy: boolean;
}) {
  const canEdit = list.status === "draft";
  const isShopping = list.status === "shopping";
  const canMarkPurchased =
    isShopping &&
    item.selected &&
    !item.is_purchased &&
    !purchasing;

  const handleCheckClick = () => {
    if (canEdit) {
      onToggleSelected();
      return;
    }

    if (canMarkPurchased) {
      onMarkPurchased();
    }
  };

  const checkDisabled =
    busy ||
    list.status === "completed" ||
    (isShopping && (!item.selected || item.is_purchased));

  return (
    <article
      className={cn(
        "group relative h-full overflow-hidden rounded-3xl border border-border/70 bg-background/35 p-4 transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-background/55 hover:shadow-lg sm:p-5",
        canEdit && !item.selected && "opacity-50 grayscale-[0.25]",
        item.is_purchased && "border-emerald-500/20 bg-emerald-500/[0.035]",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleCheckClick}
          disabled={checkDisabled}
          className={cn(
            "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-2xl border transition",
            item.is_purchased
              ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_0_24px_-8px_rgb(16_185_129)]"
              : canEdit && item.selected
                ? "border-primary bg-primary text-primary-foreground shadow-glow"
                : isShopping && item.selected
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary hover:text-white"
                  : "border-border bg-card text-muted-foreground hover:border-primary",
            checkDisabled && "cursor-not-allowed",
          )}
          aria-label={
            item.is_purchased
              ? `${item.product_name} purchased`
              : isShopping
                ? `Mark ${item.product_name} as purchased`
                : item.selected
                  ? "Remove from shopping"
                  : "Add to shopping"
          }
        >
          {purchasing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : item.is_purchased || (canEdit && item.selected) ? (
            <Check className="h-4 w-4" />
          ) : isShopping && item.selected ? (
            <ShoppingCart className="h-4 w-4" />
          ) : null}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-base font-bold">
              {item.product_name}
            </h4>
            <SourceBadge source={item.source_type} />
            {item.user_locked && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
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

          <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">
            {item.reason || "Recommended for this shopping period."}
          </p>
        </div>

        {!editing && (
          <div className="shrink-0 rounded-2xl border border-primary/15 bg-primary/[0.06] px-3 py-2 text-right">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Buy
            </p>
            <p
              className={cn(
                "mt-0.5 whitespace-nowrap text-base font-black tabular-nums",
                item.is_purchased ? "text-emerald-500" : "text-foreground",
              )}
            >
              {formatQuantity(item.purchase_quantity, item.unit)}
            </p>
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.035] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Edit purchase quantity
          </p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              value={editQuantity}
              onChange={(event) => setEditQuantity(event.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="h-9 rounded-xl"
            />
            <Input
              value={editUnit}
              onChange={(event) => setEditUnit(event.target.value)}
              className="h-9 rounded-xl"
            />
            <Button
              type="button"
              size="sm"
              className="rounded-xl bg-gradient-pink text-white"
              disabled={busy}
              onClick={onSaveEdit}
            >
              <Save className="h-3.5 w-3.5" />
              <span className="sr-only">Save</span>
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <ItemMetric
          label="In pantry"
          value={formatQuantity(item.pantry_quantity, item.unit)}
        />
        <ItemMetric
          label="Required"
          value={formatQuantity(item.required_quantity, item.unit)}
        />
        <ItemMetric
          label="Daily use"
          value={
            item.average_daily_consumption !== null
              ? `${formatNumber(item.average_daily_consumption)} ${item.unit}`
              : "—"
          }
        />
        <ItemMetric
          label="Stock lasts"
          value={
            item.estimated_days_remaining !== null
              ? `${formatNumber(item.estimated_days_remaining)} days`
              : "—"
          }
        />
      </div>

      {canEdit && (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <p className="text-[11px] text-muted-foreground">
            {item.selected ? "Included in your shop" : "Not selected"}
          </p>
          <div className="flex items-center gap-1">
            {editing ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg"
                disabled={busy}
                onClick={onCancelEdit}
              >
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg"
                disabled={busy}
                onClick={onStartEdit}
              >
                Edit
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 rounded-lg p-0"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 text-red-500" />
              <span className="sr-only">Delete item</span>
            </Button>
          </div>
        </div>
      )}

      {isShopping && item.selected && !item.is_purchased && (
        <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/[0.035] px-3 py-2 text-center text-xs text-muted-foreground">
          Tap the shopping icon to mark this item as bought and add it to Smart Pantry.
        </div>
      )}
    </article>
  );
}

function ItemMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/55 bg-card/55 px-2.5 py-2">
      <p className="truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 truncate font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: typeof ShoppingBasket;
  label: string;
  value: number | string;
  note: string;
  tone: "default" | "primary" | "success" | "warning";
}) {
  const toneClasses = {
    default: "bg-muted/60 text-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-emerald-500/10 text-emerald-500",
    warning: "bg-amber-500/10 text-amber-500",
  } as const;

  return (
    <div className="rounded-2xl border border-border/65 bg-background/45 p-4 backdrop-blur-sm transition hover:border-primary/25 hover:bg-background/60">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <div className={cn("grid h-8 w-8 place-items-center rounded-xl", toneClasses[tone])}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-black tabular-nums">{value}</p>
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
    <div className="group flex items-center gap-2.5 rounded-2xl border border-border/70 bg-background/45 px-3.5 py-3 text-sm backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:bg-background/70">
      <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
        <Icon className="h-4 w-4" />
      </div>
      <span className="font-medium">{text}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: GroceryList["status"] }) {
  const styles = {
    draft: "border-primary/20 bg-primary/10 text-primary",
    shopping: "border-amber-500/20 bg-amber-500/10 text-amber-500",
    completed: "border-emerald-500/20 bg-emerald-500/10 text-emerald-500",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
        styles[status],
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
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

  const styles = {
    consumption: "bg-sky-500/10 text-sky-400",
    meal_plan: "bg-violet-500/10 text-violet-400",
    combined: "bg-amber-500/10 text-amber-400",
    manual: "bg-primary/10 text-primary",
  } as const;

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-medium",
        styles[source],
      )}
    >
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


function downloadGroceryListPdf(list: GroceryList) {
  const selectedItems = list.items.filter(
    (item) =>
      item.selected &&
      !item.is_purchased &&
      Number(item.purchase_quantity) > 0,
  );

  if (selectedItems.length === 0) {
    throw new Error("There are no remaining selected items to download");
  }

  const lines: string[] = [
    "WasteWise AI - Grocery List",
    `${formatDate(list.start_date)} - ${formatDate(list.end_date)}`,
    `Coverage: ${list.coverage_days} days`,
    "",
  ];

  for (const priority of PRIORITY_ORDER) {
    const items = selectedItems.filter((item) => item.priority === priority);

    if (items.length === 0) {
      continue;
    }

    lines.push(PRIORITY_COPY[priority].title.toUpperCase());

    for (const item of items) {
      const checkbox = item.is_purchased ? "[x]" : "[ ]";
      lines.push(
        `${checkbox} ${item.product_name} - ${formatQuantity(
          item.purchase_quantity,
          item.unit,
        )}`,
      );
    }

    lines.push("");
  }

  lines.push(`Total items: ${selectedItems.length}`);
  lines.push(`Generated: ${new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date())}`);

  const blob = createTextPdf(lines);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = `wastewise-grocery-list-${list.start_date}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createTextPdf(sourceLines: string[]) {
  const wrappedLines = sourceLines.flatMap((line) => wrapPdfLine(line, 72));
  const linesPerPage = 46;
  const pages: string[][] = [];

  for (let index = 0; index < wrappedLines.length; index += linesPerPage) {
    pages.push(wrappedLines.slice(index, index + linesPerPage));
  }

  if (pages.length === 0) {
    pages.push([""]);
  }

  const objectCount = 3 + pages.length * 2;
  const fontObjectId = objectCount;
  const objects: string[] = new Array(objectCount + 1);
  const pageObjectIds = pages.map((_, index) => 3 + index * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pages.length} >>`;

  pages.forEach((pageLines, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = [
      "BT",
      "/F1 11 Tf",
      "48 795 Td",
      "15 TL",
      ...pageLines.flatMap((line) => [
        `(${escapePdfText(line)}) Tj`,
        "T*",
      ]),
      "ET",
    ].join("\n");

    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> ` +
      `/Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] =
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  objects[fontObjectId] =
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n%WasteWise\n";
  const offsets: number[] = new Array(objectCount + 1).fill(0);

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    offsets[objectId] = pdf.length;
    pdf += `${objectId} 0 obj\n${objects[objectId]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objectCount + 1}\n`;
  pdf += "0000000000 65535 f \n";

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    pdf += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }

  pdf +=
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}

function wrapPdfLine(value: string, maxLength: number) {
  const sanitized = sanitizePdfText(value);

  if (sanitized.length <= maxLength) {
    return [sanitized];
  }

  const words = sanitized.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > maxLength) {
      if (current) {
        lines.push(current);
        current = "";
      }

      for (let index = 0; index < word.length; index += maxLength) {
        lines.push(word.slice(index, index + maxLength));
      }

      continue;
    }

    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > maxLength) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function sanitizePdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, "?");
}

function escapePdfText(value: string) {
  return sanitizePdfText(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
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