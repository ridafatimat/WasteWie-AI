import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";
import {
  useQuery,
} from "@tanstack/react-query";
import {
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Archive,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Edit2,
  Layers3,
  Loader2,
  Package,
  Plus,
  Refrigerator,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Snowflake,
  Sparkles,
  Trash2,
  Warehouse,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
} from "framer-motion";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorMessage } from "@/components/ErrorMessage";
import { PantryFormDialog } from "@/components/PantryFormDialog";
import { RequireAuth } from "@/components/RequireAuth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cap,
  daysUntil,
  formatDate,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  deletePantryItem,
  listPantryItems,
} from "@/services/api";
import {
  extractApiError,
} from "@/services/api/client";
import type {
  PantryItem,
} from "@/types";

export const Route = createFileRoute("/pantry")({
  head: () => ({
    meta: [
      {
        title: "Smart Pantry — WasteWise AI",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell title="Smart Pantry">
        <PantryView />
      </AppShell>
    </RequireAuth>
  ),
});

const CATEGORIES = [
  "beverage",
  "dairy",
  "fruit",
  "grain",
  "meat",
  "snack",
  "vegetable",
  "other",
] as const;

const LOCATIONS = [
  "fridge",
  "freezer",
  "pantry",
] as const;

type ExpiryFilter =
  | "all"
  | "expiring";

type PantryGroup = {
  key: string;
  name: string;
  category: string;
  locations: string[];
  batches: PantryItem[];
  earliestExpiry: string | null;
  latestPurchase: string | null;
  quantitySummary: string;
  expiringBatchCount: number;
};

const GENERIC_DISPLAY_RULES: Array<{
  terms: string[];
  name: string;
}> = [
  {
    terms: [
      "macaroni & cheese",
      "macaroni and cheese",
      "mac & cheese",
    ],
    name: "Macaroni & Cheese",
  },
  {
    terms: ["greek yogurt"],
    name: "Greek Yogurt",
  },
  {
    terms: ["yogurt"],
    name: "Yogurt",
  },
  {
    terms: ["chicken breast"],
    name: "Chicken Breast",
  },
  {
    terms: ["frozen chicken"],
    name: "Frozen Chicken",
  },
  {
    terms: ["chicken"],
    name: "Chicken",
  },
  {
    terms: ["egg", "eggs"],
    name: "Eggs",
  },
  {
    terms: ["pita bread"],
    name: "Pita Bread",
  },
  {
    terms: ["bread"],
    name: "Bread",
  },
  {
    terms: ["banana", "bananas"],
    name: "Bananas",
  },
  {
    terms: ["strawberry", "strawberries"],
    name: "Strawberries",
  },
  {
    terms: ["blueberry", "blueberries"],
    name: "Blueberries",
  },
  {
    terms: ["avocado", "avocados"],
    name: "Avocados",
  },
  {
    terms: ["romaine"],
    name: "Romaine Lettuce",
  },
  {
    terms: ["milk"],
    name: "Milk",
  },
  {
    terms: ["tortilla", "tortillas"],
    name: "Tortillas",
  },
  {
    terms: ["brown rice"],
    name: "Brown Rice",
  },
  {
    terms: ["white rice"],
    name: "White Rice",
  },
  {
    terms: ["rice"],
    name: "Rice",
  },
  {
    terms: ["oats", "oatmeal"],
    name: "Oats",
  },
  {
    terms: ["pasta sauce"],
    name: "Pasta Sauce",
  },
  {
    terms: ["black beans"],
    name: "Black Beans",
  },
  {
    terms: ["beans"],
    name: "Beans",
  },
  {
    terms: [
      "coca-cola",
      "coca cola",
      "pepsi",
      "soft drink",
      "soda",
      "cola",
    ],
    name: "Soft Drink",
  },
  {
    terms: ["gatorade", "sports drink"],
    name: "Sports Drink",
  },
  {
    terms: [
      "nutella",
      "nutelka",
      "hazelnut spread",
    ],
    name: "Hazelnut Spread",
  },
  {
    terms: [
      "biskrem",
      "cookie",
      "cookies",
      "biscuit",
      "biscuits",
    ],
    name: "Cookies",
  },
  {
    terms: ["cheese"],
    name: "Cheese",
  },
  {
    terms: [
      "flour",
      "maida",
      "medda",
      "atta",
    ],
    name: "Flour",
  },
];

function normalizePantryName(name: string) {
  const normalized = name
    .trim()
    .replace(/\s+/g, " ");

  const lower = normalized.toLowerCase();

  for (const rule of GENERIC_DISPLAY_RULES) {
    if (
      rule.terms.some((term) =>
        lower.includes(term)
      )
    ) {
      return rule.name;
    }
  }

  return normalized;
}

function quantityOf(item: PantryItem) {
  const raw =
    item.quantity_remaining
    ?? item.quantity
    ?? item.quantity_initial
    ?? 0;

  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function isVisiblePantryItem(item: PantryItem) {
  const status = (item.status || "")
    .trim()
    .toLowerCase();
  const expiryDays = daysUntil(item.expiry_date);

  const isConsumed =
    status === "consumed"
    || quantityOf(item) <= 0;

  const isExpired =
    status === "expired"
    || (expiryDays !== null && expiryDays < 0);

  return !isConsumed && !isExpired;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUnit(
  unit: string,
  quantity: number,
) {
  const normalized = unit || "item";

  if (quantity === 1) {
    if (normalized === "items") return "item";
    if (normalized === "pieces") return "piece";
    if (normalized === "packs") return "pack";
  }

  if (quantity !== 1) {
    if (normalized === "item") return "items";
    if (normalized === "piece") return "pieces";
    if (normalized === "pack") return "packs";
  }

  return normalized;
}

function summarizeQuantities(
  batches: PantryItem[],
) {
  const totals = new Map<string, number>();

  for (const batch of batches) {
    const unit = batch.unit || "item";
    totals.set(
      unit,
      (totals.get(unit) ?? 0)
        + quantityOf(batch),
    );
  }

  return Array.from(totals.entries())
    .map(([unit, quantity]) =>
      `${formatNumber(quantity)} ${formatUnit(unit, quantity)}`
    )
    .join(" + ");
}

function earliestDate(
  values: Array<string | null | undefined>,
) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .sort();

  return dates[0] ?? null;
}

function latestDate(
  values: Array<string | null | undefined>,
) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .sort()
    .reverse();

  return dates[0] ?? null;
}

function mostCommon(
  values: Array<string | null | undefined>,
) {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? "other";
}

function buildGroups(items: PantryItem[]) {
  const grouped = new Map<string, PantryItem[]>();

  for (const item of items) {
    const name = normalizePantryName(
      item.product_name,
    );
    const key = name.toLowerCase();
    const existing = grouped.get(key) ?? [];
    existing.push(item);
    grouped.set(key, existing);
  }

  return Array.from(grouped.entries()).map(
    ([key, batches]): PantryGroup => {
      const sortedBatches = [...batches].sort(
        (a, b) =>
          (a.expiry_date || "9999-12-31")
            .localeCompare(
              b.expiry_date || "9999-12-31",
            ),
      );

      const expiringBatchCount = sortedBatches.filter(
        (batch) => {
          const days = daysUntil(batch.expiry_date);
          return days !== null && days >= 0 && days <= 3;
        },
      ).length;

      return {
        key,
        name: normalizePantryName(
          sortedBatches[0].product_name,
        ),
        category: mostCommon(
          sortedBatches.map((item) => item.category),
        ),
        locations: Array.from(
          new Set(
            sortedBatches
              .map((item) => item.storage_location)
              .filter((value): value is string => Boolean(value)),
          ),
        ),
        batches: sortedBatches,
        earliestExpiry: earliestDate(
          sortedBatches.map((item) => item.expiry_date),
        ),
        latestPurchase: latestDate(
          sortedBatches.map((item) => item.purchase_date),
        ),
        quantitySummary: summarizeQuantities(sortedBatches),
        expiringBatchCount,
      };
    },
  );
}

function PantryView() {
  const query = useQuery({
    queryKey: ["pantry"],
    queryFn: listPantryItems,
    retry: 0,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [deleting, setDeleting] = useState<PantryItem | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(),
  );

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [location, setLocation] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("expiry");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");

  const allReturnedItems = query.data ?? [];

  const items = useMemo(
    () => allReturnedItems.filter(isVisiblePantryItem),
    [allReturnedItems],
  );

  const statuses = useMemo(
    () => Array.from(
      new Set(
        items
          .map((item) =>
            (item.status || "").toLowerCase()
          )
          .filter(Boolean),
      ),
    ),
    [items],
  );

  const groups = useMemo(() => {
    let batches = items;

    if (category !== "all") {
      batches = batches.filter(
        (item) => item.category === category,
      );
    }

    if (location !== "all") {
      batches = batches.filter(
        (item) => item.storage_location === location,
      );
    }

    if (status !== "all") {
      batches = batches.filter(
        (item) =>
          (item.status || "").toLowerCase() === status,
      );
    }

    let output = buildGroups(batches);

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      output = output.filter((group) =>
        group.name.toLowerCase().includes(term)
        || group.batches.some((batch) =>
          batch.product_name.toLowerCase().includes(term)
        )
      );
    }

    if (expiryFilter === "expiring") {
      output = output.filter(
        (group) => group.expiringBatchCount > 0,
      );
    }

    if (sort === "name") {
      output.sort((a, b) =>
        a.name.localeCompare(b.name)
      );
    } else if (sort === "recent") {
      output.sort((a, b) =>
        (b.latestPurchase || "")
          .localeCompare(a.latestPurchase || "")
      );
    } else if (sort === "batches") {
      output.sort((a, b) =>
        b.batches.length - a.batches.length
      );
    } else {
      output.sort((a, b) =>
        (a.earliestExpiry || "9999-12-31")
          .localeCompare(
            b.earliestExpiry || "9999-12-31",
          )
      );
    }

    return output;
  }, [
    items,
    search,
    category,
    location,
    status,
    sort,
    expiryFilter,
  ]);

  const allGroups = useMemo(
    () => buildGroups(items),
    [items],
  );

  const expiringBatches = items.filter((item) => {
    const days = daysUntil(item.expiry_date);
    return days !== null && days >= 0 && days <= 3;
  }).length;

  const expiringGroups = allGroups.filter(
    (group) => group.expiringBatchCount > 0,
  ).length;

  const activeStorageAreas = new Set(
    items
      .map((item) => item.storage_location)
      .filter(Boolean),
  ).size;

  const hasActiveFilters =
    Boolean(search.trim())
    || category !== "all"
    || location !== "all"
    || status !== "all"
    || sort !== "expiry"
    || expiryFilter !== "all";

  const resetFilters = () => {
    setSearch("");
    setCategory("all");
    setLocation("all");
    setStatus("all");
    setSort("expiry");
    setExpiryFilter("all");
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!deleting) return;

    setDeletingLoading(true);

    try {
      await deletePantryItem(deleting.id);
      toast.success("Pantry batch deleted");
      setDeleting(null);
      await query.refetch();
    } catch (error) {
      toast.error(extractApiError(error));
    } finally {
      setDeletingLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 pb-8">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[30px] border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:p-7"
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Pantry command centre
            </div>

            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Everything in your pantry,
              <span className="text-primary"> beautifully organised.</span>
            </h2>

            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Products stay grouped by name, while every purchase batch keeps
              its own quantity, storage and expiry details. Consumed and expired
              batches remain automatically hidden.
            </p>
          </div>

          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            size="lg"
            className="h-12 rounded-2xl bg-gradient-pink px-5 text-white shadow-glow transition hover:-translate-y-0.5"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add pantry item
          </Button>
        </div>
      </motion.section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Package}
          label="Active products"
          value={allGroups.length}
          note={`${items.length} individual active batches`}
          delay={0}
        />
        <StatCard
          icon={Layers3}
          label="Active batches"
          value={items.length}
          note="Consumed and expired are hidden"
          delay={0.04}
        />
        <StatCard
          icon={Clock3}
          label="Expiring soon"
          value={expiringBatches}
          note={`${expiringGroups} products within 3 days`}
          tone="warning"
          delay={0.08}
        />
        <StatCard
          icon={Archive}
          label="Storage areas"
          value={activeStorageAreas}
          note="Locations holding active stock"
          delay={0.12}
        />
      </div>

      {query.error && (
        <ErrorMessage
          message={extractApiError(query.error)}
          onRetry={() => query.refetch()}
        />
      )}

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="rounded-[28px] border border-border bg-card/70 p-4 shadow-sm backdrop-blur sm:p-5"
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="inline-flex w-full rounded-2xl border border-border bg-background/60 p-1 sm:w-auto">
            <FilterTab
              active={expiryFilter === "all"}
              onClick={() => setExpiryFilter("all")}
              label="All active"
              count={allGroups.length}
            />
            <FilterTab
              active={expiryFilter === "expiring"}
              onClick={() => setExpiryFilter("expiring")}
              label="Expiring soon"
              count={expiringGroups}
              urgent
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              <span>
                {groups.length} product{groups.length === 1 ? "" : "s"} shown
              </span>
            </div>

            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="rounded-xl text-muted-foreground hover:text-primary"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="relative md:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products or receipt names…"
              className="h-11 rounded-2xl border-border bg-background/60 pl-10"
            />
          </div>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-11 rounded-2xl bg-background/60">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All categories
              </SelectItem>
              {CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {cap(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={location} onValueChange={setLocation}>
            <SelectTrigger className="h-11 rounded-2xl bg-background/60">
              <SelectValue placeholder="Storage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All storage
              </SelectItem>
              {LOCATIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {cap(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-11 rounded-2xl bg-background/60">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All active statuses
              </SelectItem>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {cap(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="h-11 rounded-2xl bg-background/60">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="expiry">
                Expiry soonest
              </SelectItem>
              <SelectItem value="name">
                Name A–Z
              </SelectItem>
              <SelectItem value="recent">
                Recently purchased
              </SelectItem>
              <SelectItem value="batches">
                Most batches
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </motion.section>

      {query.isLoading && <SkeletonGrid />}

      {!query.isLoading && !query.error && groups.length === 0 && (
        <EmptyState
          icon={Package}
          title="No active pantry products"
          description={
            items.length === 0
              ? allReturnedItems.length > 0
                ? "All recorded batches are consumed or expired, so they are hidden from the active pantry."
                : "Add an item manually or scan a receipt to create your first pantry batch."
              : "No active products match the current search and filters."
          }
          action={
            items.length === 0 ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
                className="rounded-xl bg-gradient-pink text-white"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add pantry item
              </Button>
            ) : hasActiveFilters ? (
              <Button
                onClick={resetFilters}
                variant="outline"
                className="rounded-xl"
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Clear filters
              </Button>
            ) : undefined
          }
        />
      )}

      {groups.length > 0 && (
        <motion.div
          layout
          className="grid items-start gap-4 xl:grid-cols-2"
        >
          {groups.map((group, index) => {
            const expanded = expandedGroups.has(group.key);
            const expiry = getExpiryPresentation(
              group.earliestExpiry,
            );

            return (
              <motion.article
                key={group.key}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay: Math.min(index * 0.025, 0.2),
                }}
                className={cn(
                  "group overflow-hidden rounded-[26px] border bg-card transition duration-300",
                  expanded
                    ? "border-primary/35 shadow-glow"
                    : "border-border hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={expanded}
                  className="w-full p-5 text-left sm:p-6"
                >
                  <div className="flex items-start gap-4">
                    <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-primary/15 bg-primary/10 text-primary transition duration-300 group-hover:scale-105 group-hover:bg-primary/15">
                      <Package className="h-5 w-5" />
                      {group.expiringBatchCount > 0 && (
                        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-card bg-warning" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-lg font-semibold tracking-tight">
                              {group.name}
                            </h3>
                            <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                              {group.batches.length} batch{group.batches.length === 1 ? "" : "es"}
                            </span>
                          </div>

                          <p className="mt-1 truncate text-sm text-muted-foreground">
                            {group.quantitySummary || "Quantity unavailable"}
                          </p>
                        </div>

                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-background/50 text-muted-foreground transition group-hover:border-primary/25 group-hover:text-primary">
                          {expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-2">
                        <MetaPill>
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                          {cap(group.category)}
                        </MetaPill>
                        <MetaPill>
                          <StorageIcon
                            location={group.locations[0] ?? "pantry"}
                          />
                          {group.locations.length === 1
                            ? cap(group.locations[0] ?? "pantry")
                            : `${group.locations.length} locations`}
                        </MetaPill>
                      </div>

                      <div className="mt-5 flex items-end justify-between gap-4 border-t border-border/70 pt-4">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Earliest expiry
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {formatDate(group.earliestExpiry)}
                          </p>
                        </div>

                        <span className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          expiry.className,
                        )}>
                          {expiry.label}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {expanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border bg-background/35 p-4 sm:p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                              <Layers3 className="h-4 w-4" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold">
                                Purchase batches
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                Each batch keeps its own dates and quantity.
                              </p>
                            </div>
                          </div>

                          <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            Active stock only
                          </span>
                        </div>

                        <div className="grid gap-3">
                          {group.batches.map((batch, batchIndex) => {
                            const batchExpiry = getExpiryPresentation(
                              batch.expiry_date,
                            );

                            return (
                              <div
                                key={batch.id}
                                className="rounded-2xl border border-border bg-card p-4 transition hover:border-primary/25"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                      Batch {batchIndex + 1}
                                    </p>
                                    <p className="mt-1 text-lg font-semibold">
                                      {formatNumber(quantityOf(batch))}{" "}
                                      <span className="text-sm font-normal text-muted-foreground">
                                        {formatUnit(
                                          batch.unit,
                                          quantityOf(batch),
                                        )}
                                      </span>
                                    </p>
                                  </div>

                                  <span className={cn(
                                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                    batchExpiry.className,
                                  )}>
                                    {batchExpiry.label}
                                  </span>
                                </div>

                                <div className="mt-4 grid grid-cols-2 gap-3">
                                  <BatchInfo
                                    icon={CalendarDays}
                                    label="Purchased"
                                    value={formatDate(batch.purchase_date)}
                                  />
                                  <BatchInfo
                                    icon={Clock3}
                                    label="Expires"
                                    value={formatDate(batch.expiry_date)}
                                  />
                                  <BatchInfo
                                    icon={Archive}
                                    label="Storage"
                                    value={cap(batch.storage_location as string)}
                                  />
                                  <BatchInfo
                                    icon={Package}
                                    label="Receipt name"
                                    value={batch.product_name}
                                  />
                                </div>

                                <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                                  <Button
                                    asChild
                                    size="sm"
                                    variant="ghost"
                                    className="rounded-xl"
                                  >
                                    <Link
                                      to="/pantry/$id"
                                      params={{ id: batch.id }}
                                    >
                                      View details
                                      <ChevronRight className="ml-1 h-3.5 w-3.5" />
                                    </Link>
                                  </Button>

                                  <div className="flex gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-9 w-9 rounded-xl"
                                      onClick={() => {
                                        setEditing(batch);
                                        setDialogOpen(true);
                                      }}
                                    >
                                      <Edit2 className="h-3.5 w-3.5" />
                                      <span className="sr-only">
                                        Edit batch
                                      </span>
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-9 w-9 rounded-xl hover:bg-danger/10"
                                      onClick={() => setDeleting(batch)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                                      <span className="sr-only">
                                        Delete batch
                                      </span>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </motion.div>
      )}

      <PantryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
        onSaved={() => query.refetch()}
      />

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this pantry batch?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes only the selected purchase batch for
              “{deleting?.product_name}”. Other batches in the same
              product group will remain in your pantry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                confirmDelete();
              }}
              className="bg-danger text-white hover:bg-danger/90"
              disabled={deletingLoading}
            >
              {deletingLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete batch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  note,
  tone = "default",
  delay,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  note: string;
  tone?: "default" | "warning";
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      whileHover={{ y: -3 }}
      className="relative overflow-hidden rounded-[24px] border border-border bg-card p-5 transition hover:border-primary/30"
    >
      <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-primary/5 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-4 text-3xl font-bold tabular-nums">
            {value}
          </p>
        </div>

        <div className={cn(
          "grid h-10 w-10 place-items-center rounded-2xl border",
          tone === "warning"
            ? "border-warning/15 bg-warning/10 text-warning"
            : "border-primary/15 bg-primary/10 text-primary",
        )}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <p className="relative mt-2 text-xs text-muted-foreground">
        {note}
      </p>
    </motion.div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
  urgent = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  urgent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition sm:flex-none",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
      <span className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px]",
        active
          ? "bg-white/15 text-current"
          : urgent
            ? "bg-warning/10 text-warning"
            : "bg-muted text-muted-foreground",
      )}>
        {count}
      </span>
    </button>
  );
}

function MetaPill({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/55 px-2.5 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function StorageIcon({
  location,
}: {
  location: string;
}) {
  if (location === "fridge") {
    return <Refrigerator className="h-3.5 w-3.5" />;
  }

  if (location === "freezer") {
    return <Snowflake className="h-3.5 w-3.5" />;
  }

  return <Warehouse className="h-3.5 w-3.5" />;
}

function BatchInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-background/55 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </div>
      <p className="mt-1 truncate text-xs font-medium">
        {value || "—"}
      </p>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="h-56 animate-pulse rounded-[26px] border border-border bg-card/60"
        />
      ))}
    </div>
  );
}

function getExpiryPresentation(
  expiryDate: string | null | undefined,
) {
  const days = daysUntil(expiryDate);

  if (days === null) {
    return {
      label: "No expiry",
      className: "bg-muted text-muted-foreground",
    };
  }

  if (days < 0) {
    return {
      label: `${Math.abs(days)}d expired`,
      className: "bg-danger/10 text-danger",
    };
  }

  if (days === 0) {
    return {
      label: "Use today",
      className: "bg-danger/10 text-danger",
    };
  }

  if (days <= 3) {
    return {
      label: `${days}d left`,
      className: "bg-warning/10 text-warning",
    };
  }

  if (days <= 7) {
    return {
      label: `${days}d left`,
      className: "bg-yellow-500/10 text-yellow-500",
    };
  }

  return {
    label: "Safe",
    className: "bg-success/10 text-success",
  };
}