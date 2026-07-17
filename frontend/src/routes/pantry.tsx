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
} from "react";
import {
  AlertTriangle,
  Archive,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Edit2,
  Layers3,
  Loader2,
  Package,
  Plus,
  Refrigerator,
  Search,
  Snowflake,
  Trash2,
  Warehouse,
} from "lucide-react";
import {
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
  | "expiring"
  | "expired";

type PantryGroup = {
  key: string;
  name: string;
  category: string;
  locations: string[];
  batches: PantryItem[];
  earliestExpiry: string | null;
  latestPurchase: string | null;
  quantitySummary: string;
  expiredBatchCount: number;
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

      const expiredBatchCount = sortedBatches.filter(
        (batch) => {
          const days = daysUntil(batch.expiry_date);
          return days !== null && days < 0;
        },
      ).length;

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
        expiredBatchCount,
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

  const items = query.data ?? [];

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

    if (expiryFilter === "expired") {
      output = output.filter(
        (group) => group.expiredBatchCount > 0,
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

  const expiredBatches = items.filter((item) => {
    const days = daysUntil(item.expiry_date);
    return days !== null && days < 0;
  }).length;

  const expiringBatches = items.filter((item) => {
    const days = daysUntil(item.expiry_date);
    return days !== null && days >= 0 && days <= 3;
  }).length;

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
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Products are grouped for easy reading. Open a product to see
            its individual purchase batches, quantities and expiry dates.
          </p>
        </div>

        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          className="bg-gradient-pink text-white shadow-glow"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add pantry item
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Package}
          label="Products"
          value={allGroups.length}
          note={`${items.length} individual batches`}
        />
        <StatCard
          icon={Layers3}
          label="Batches"
          value={items.length}
          note="Purchase dates kept separate"
        />
        <StatCard
          icon={Clock3}
          label="Expiring soon"
          value={expiringBatches}
          note="Within the next 3 days"
          tone="warning"
        />
        <StatCard
          icon={AlertTriangle}
          label="Expired"
          value={expiredBatches}
          note="Needs review"
          tone="danger"
        />
      </div>

      <div className="rounded-3xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap gap-2 border-b border-border/70 pb-4">
          <FilterTab
            active={expiryFilter === "all"}
            onClick={() => setExpiryFilter("all")}
            label="All products"
            count={allGroups.length}
          />
          <FilterTab
            active={expiryFilter === "expiring"}
            onClick={() => setExpiryFilter("expiring")}
            label="Expiring soon"
            count={allGroups.filter((group) =>
              group.expiringBatchCount > 0
            ).length}
          />
          <FilterTab
            active={expiryFilter === "expired"}
            onClick={() => setExpiryFilter("expired")}
            label="Expired"
            count={allGroups.filter((group) =>
              group.expiredBatchCount > 0
            ).length}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="relative sm:col-span-2 xl:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products or receipt names…"
              className="pl-9"
            />
          </div>

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
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
            <SelectTrigger>
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
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                All statuses
              </SelectItem>
              {statuses.map((value) => (
                <SelectItem key={value} value={value}>
                  {cap(value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger>
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
      </div>

      {query.isLoading && (
        <div className="grid gap-3">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-3xl border border-border bg-card/60"
            />
          ))}
        </div>
      )}

      {query.error && (
        <ErrorMessage
          message={extractApiError(query.error)}
          onRetry={() => query.refetch()}
        />
      )}

      {!query.isLoading && !query.error && groups.length === 0 && (
        <EmptyState
          icon={Package}
          title="No pantry products"
          description={
            items.length === 0
              ? "Add an item manually or scan a receipt to create your first pantry batch."
              : "No products match the current search and filters."
          }
          action={
            items.length === 0 ? (
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
                className="bg-gradient-pink text-white"
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Add pantry item
              </Button>
            ) : undefined
          }
        />
      )}

      {groups.length > 0 && (
        <div className="grid gap-3">
          {groups.map((group) => {
            const expanded = expandedGroups.has(group.key);
            const expiry = getExpiryPresentation(
              group.earliestExpiry,
            );

            return (
              <motion.article
                key={group.key}
                layout
                className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="grid w-full gap-4 p-4 text-left transition hover:bg-muted/25 sm:p-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.75fr)_auto] lg:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <Package className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold">
                          {group.name}
                        </h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          {group.batches.length} batch{group.batches.length === 1 ? "" : "es"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {group.quantitySummary}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
                    <span className="capitalize">
                      {group.category}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <StorageIcon
                        location={group.locations[0] ?? "pantry"}
                      />
                      {group.locations.length === 1
                        ? cap(group.locations[0])
                        : `${group.locations.length} locations`}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">
                      Earliest expiry
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {formatDate(group.earliestExpiry)}
                      </span>
                      <span className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        expiry.className,
                      )}>
                        {expiry.label}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    {expanded ? (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </button>

                {expanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="border-t border-border bg-background/35 p-4 sm:p-5"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Layers3 className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold">
                        Individual purchase batches
                      </h4>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      {group.batches.map((batch, index) => {
                        const batchExpiry = getExpiryPresentation(
                          batch.expiry_date,
                        );

                        return (
                          <div
                            key={batch.id}
                            className="rounded-2xl border border-border bg-card p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  Batch {index + 1}
                                </p>
                                <p className="mt-1 font-semibold">
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

                            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
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

                            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                              <Button asChild size="sm" variant="ghost">
                                <Link
                                  to="/pantry/$id"
                                  params={{ id: batch.id }}
                                >
                                  View details
                                </Link>
                              </Button>

                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
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
                                  size="sm"
                                  variant="ghost"
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
                  </motion.div>
                )}
              </motion.article>
            );
          })}
        </div>
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
}: {
  icon: typeof Package;
  label: string;
  value: number;
  note: string;
  tone?: "default" | "warning" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className={cn(
          "grid h-8 w-8 place-items-center rounded-xl",
          tone === "danger"
            ? "bg-red-500/10 text-red-500"
            : tone === "warning"
              ? "bg-amber-500/10 text-amber-500"
              : "bg-primary/10 text-primary",
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      {label}
      <span className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px]",
        active
          ? "bg-primary/15"
          : "bg-muted",
      )}>
        {count}
      </span>
    </button>
  );
}

function StorageIcon({
  location,
}: {
  location: string;
}) {
  if (location === "fridge") {
    return <Refrigerator className="h-4 w-4" />;
  }

  if (location === "freezer") {
    return <Snowflake className="h-4 w-4" />;
  }

  return <Warehouse className="h-4 w-4" />;
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
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </div>
      <p className="mt-1 truncate text-sm">
        {value || "—"}
      </p>
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
      className: "bg-red-500/10 text-red-500",
    };
  }

  if (days === 0) {
    return {
      label: "Use today",
      className: "bg-red-500/10 text-red-500",
    };
  }

  if (days <= 3) {
    return {
      label: `${days}d left`,
      className: "bg-amber-500/10 text-amber-500",
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
    className: "bg-emerald-500/10 text-emerald-500",
  };
}