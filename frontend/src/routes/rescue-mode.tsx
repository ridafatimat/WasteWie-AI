import { useState } from "react";
import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ChefHat,
  ChevronDown,
  ChevronUp,
  Clock3,
  Flame,
  Loader2,
  ShieldAlert,
  Trash2,
  Utensils,
} from "lucide-react";
import { toast } from "sonner";

import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import {
  createInventoryEvent,
  getPantryItem,
  getWasteRisk,
} from "@/services/api";
import { extractApiError } from "@/services/api/client";
import { ErrorMessage } from "@/components/ErrorMessage";
import { EmptyState } from "@/components/EmptyState";
import {
  RiskBadge,
  RiskScore,
} from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";

import type {
  PantryItem,
  RiskPrediction,
} from "@/types";

export const Route = createFileRoute(
  "/rescue-mode",
)({
  head: () => ({
    meta: [
      {
        title:
          "Rescue Mode — WasteWise AI",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell title="Rescue Mode">
        <View />
      </AppShell>
    </RequireAuth>
  ),
});

type RescueAction =
  | "consumed"
  | "wasted";

type RescueActionVariables = {
  pantryItemId: string;
  productName: string;
  action: RescueAction;
};

type ExtendedRiskPrediction =
  RiskPrediction & {
    is_expired?: boolean;
    days_until_expiry?: number;
  };

type ExtendedPantryItem =
  PantryItem & {
    current_quantity?: number;
    quantity_remaining?: number;
  };

const INITIAL_VISIBLE_ITEMS = 6;

function isExpiredItem(
  item: RiskPrediction,
) {
  const prediction =
    item as ExtendedRiskPrediction;

  if (prediction.is_expired === true) {
    return true;
  }

  if (
    typeof prediction.days_until_expiry ===
      "number" &&
    prediction.days_until_expiry < 0
  ) {
    return true;
  }

  return (
    prediction.reasons?.some(
      (reason) =>
        /expired|past (?:its )?expiry|expiry date has passed|days? overdue/i.test(
          reason,
        ),
    ) ?? false
  );
}

function getRiskRank(
  band?: string,
) {
  const ranks: Record<
    string,
    number
  > = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return (
    ranks[
      band?.toLowerCase() ?? ""
    ] ?? 3
  );
}

function getRiskPercentage(
  score?: number,
) {
  const percentage = Math.round(
    (Number(score) || 0) * 100,
  );

  return Math.min(
    100,
    Math.max(0, percentage),
  );
}

function getExpiryLabel(
  item: RiskPrediction,
) {
  const daysUntilExpiry = (
    item as ExtendedRiskPrediction
  ).days_until_expiry;

  if (
    typeof daysUntilExpiry !==
    "number"
  ) {
    return "Use soon";
  }

  if (daysUntilExpiry === 0) {
    return "Expires today";
  }

  if (daysUntilExpiry === 1) {
    return "Expires tomorrow";
  }

  return `Expires in ${daysUntilExpiry} days`;
}

function getRiskMessage(
  item: RiskPrediction,
) {
  const daysUntilExpiry = (
    item as ExtendedRiskPrediction
  ).days_until_expiry;

  if (daysUntilExpiry === 0) {
    return "Use this today before it goes to waste.";
  }

  if (daysUntilExpiry === 1) {
    return "Try to use this by tomorrow.";
  }

  switch (
    item.risk_band?.toLowerCase()
  ) {
    case "high":
      return "High waste risk. Use this as soon as possible.";

    case "medium":
      return "Plan to use this item soon.";

    default:
      return "Keep this item in your upcoming meal plan.";
  }
}

function View() {
  const queryClient =
    useQueryClient();

  const [showAll, setShowAll] =
    useState(false);

  const risksQuery = useQuery({
    queryKey: ["risks"],
    queryFn: getWasteRisk,
    retry: 0,
  });

  const actionMutation =
    useMutation({
      mutationFn: async ({
        pantryItemId,
        productName,
        action,
      }: RescueActionVariables) => {
        const pantryItem =
          (await getPantryItem(
            pantryItemId,
          )) as ExtendedPantryItem;

        const rawQuantity =
          pantryItem.quantity ??
          pantryItem.current_quantity ??
          pantryItem.quantity_remaining ??
          1;

        const quantity =
          Number(rawQuantity);

        if (
          !Number.isFinite(quantity) ||
          quantity <= 0
        ) {
          throw new Error(
            `${productName} has no available quantity.`,
          );
        }

        return createInventoryEvent(
          pantryItemId,
          {
            event_type: action,
            quantity,
            notes:
              action === "consumed"
                ? "Marked consumed from Rescue Mode"
                : "Marked wasted from Rescue Mode",
          },
        );
      },

      onSuccess: async (
        _data,
        variables,
      ) => {
        const actionText =
          variables.action ===
          "consumed"
            ? "consumed"
            : "wasted";

        toast.success(
          `${variables.productName} marked as ${actionText}.`,
        );

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["risks"],
          }),
          queryClient.invalidateQueries({
            queryKey: [
              "pantry-items",
            ],
          }),
          queryClient.invalidateQueries({
            queryKey: [
              "inventory-events",
            ],
          }),
          queryClient.invalidateQueries({
            queryKey: [
              "dashboard",
            ],
          }),
        ]);
      },

      onError: (error) => {
        toast.error(
          extractApiError(error),
        );
      },
    });

  const items = (
    risksQuery.data ?? []
  )
    .filter(
      (item) =>
        !isExpiredItem(item),
    )
    .slice()
    .sort((a, b) => {
      const bandDifference =
        getRiskRank(a.risk_band) -
        getRiskRank(b.risk_band);

      if (bandDifference !== 0) {
        return bandDifference;
      }

      const daysA =
        (
          a as ExtendedRiskPrediction
        ).days_until_expiry ??
        Number.POSITIVE_INFINITY;

      const daysB =
        (
          b as ExtendedRiskPrediction
        ).days_until_expiry ??
        Number.POSITIVE_INFINITY;

      if (daysA !== daysB) {
        return daysA - daysB;
      }

      return (
        b.risk_score -
        a.risk_score
      );
    });

  const visibleItems = showAll
    ? items
    : items.slice(
        0,
        INITIAL_VISIBLE_ITEMS,
      );

  const hiddenItemCount =
    Math.max(
      0,
      items.length -
        INITIAL_VISIBLE_ITEMS,
    );

  const highRiskCount =
    items.filter(
      (item) =>
        item.risk_band?.toLowerCase() ===
        "high",
    ).length;

  const mediumRiskCount =
    items.filter(
      (item) =>
        item.risk_band?.toLowerCase() ===
        "medium",
    ).length;

  function markItem(
    item: RiskPrediction,
    action: RescueAction,
  ) {
    actionMutation.mutate({
      pantryItemId:
        item.pantry_item_id,
      productName:
        item.product_name,
      action,
    });
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary-dark/50 via-card to-card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-primary-soft">
              <ShieldAlert className="h-4 w-4" />

              <span className="text-xs font-semibold uppercase tracking-widest">
                Rescue Mode
              </span>
            </div>

            <h2 className="mt-2 text-lg font-semibold text-foreground">
              Use these items before they become waste
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Expired items are hidden. The most urgent items appear first.
            </p>
          </div>

          {!risksQuery.isLoading &&
            !risksQuery.error &&
            items.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:min-w-[280px]">
                <div className="rounded-xl border border-border/80 bg-background/45 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-foreground">
                    {items.length}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    To rescue
                  </p>
                </div>

                <div className="rounded-xl border border-danger/25 bg-danger/5 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-danger">
                    {highRiskCount}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    High
                  </p>
                </div>

                <div className="rounded-xl border border-warning/25 bg-warning/5 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-warning">
                    {mediumRiskCount}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Medium
                  </p>
                </div>
              </div>
            )}
        </div>
      </section>

      {risksQuery.isLoading && (
        <div className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map(
            (index) => (
              <div
                key={index}
                className="h-48 animate-pulse rounded-2xl border border-border bg-card/60"
              />
            ),
          )}
        </div>
      )}

      {risksQuery.error && (
        <ErrorMessage
          message={extractApiError(
            risksQuery.error,
          )}
          onRetry={() =>
            risksQuery.refetch()
          }
        />
      )}

      {!risksQuery.isLoading &&
        !risksQuery.error &&
        items.length === 0 && (
          <EmptyState
            icon={ShieldAlert}
            title="No items need rescuing"
            description="There are no non-expired pantry items requiring attention right now."
          />
        )}

      {!risksQuery.isLoading &&
        !risksQuery.error &&
        items.length > 0 && (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {visibleItems.map(
                (item, index) => {
                  const riskBand =
                    item.risk_band?.toLowerCase() ??
                    "low";

                  const high =
                    riskBand === "high";

                  const medium =
                    riskBand === "medium";

                  const riskPercentage =
                    getRiskPercentage(
                      item.risk_score,
                    );

                  const currentAction =
                    actionMutation.variables;

                  const isCurrentItem =
                    actionMutation.isPending &&
                    currentAction?.pantryItemId ===
                      item.pantry_item_id;

                  const consuming =
                    isCurrentItem &&
                    currentAction?.action ===
                      "consumed";

                  const wasting =
                    isCurrentItem &&
                    currentAction?.action ===
                      "wasted";

                  return (
                    <motion.article
                      key={
                        item.pantry_item_id
                      }
                      initial={{
                        opacity: 0,
                        y: 8,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        duration: 0.22,
                        delay: Math.min(
                          index * 0.025,
                          0.15,
                        ),
                      }}
                      className={`flex h-full flex-col rounded-2xl border p-4 transition-colors hover:border-primary/45 ${
                        high
                          ? "border-primary/40 bg-primary-dark/30"
                          : medium
                            ? "border-warning/25 bg-card"
                            : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to="/pantry/$id"
                            params={{
                              id: item.pantry_item_id,
                            }}
                            title={
                              item.product_name
                            }
                            className="block truncate text-base font-semibold text-foreground transition-colors hover:text-primary"
                          >
                            {
                              item.product_name
                            }
                          </Link>

                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Clock3 className="h-3.5 w-3.5 shrink-0" />

                            <span>
                              {getExpiryLabel(
                                item,
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {high && (
                            <Flame className="h-4 w-4 text-danger" />
                          )}

                          <div className="text-lg font-bold leading-none">
                            <RiskScore
                              score={
                                item.risk_score
                              }
                            />
                          </div>

                          <RiskBadge
                            band={
                              item.risk_band
                            }
                          />
                        </div>
                      </div>

                      <p className="mt-3 text-sm leading-5 text-muted-foreground">
                        {getRiskMessage(
                          item,
                        )}
                      </p>

                      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background/80">
                        <div
                          className={`h-full rounded-full transition-all ${
                            high
                              ? "bg-danger"
                              : medium
                                ? "bg-warning"
                                : "bg-success"
                          }`}
                          style={{
                            width: `${riskPercentage}%`,
                          }}
                        />
                      </div>

                      <div className="mt-auto grid grid-cols-2 gap-2 pt-4 sm:flex sm:flex-wrap">
                        <Link
                          to="/pantry/$id"
                          params={{
                            id: item.pantry_item_id,
                          }}
                          className="contents sm:block"
                        >
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                          >
                            View item
                          </Button>
                        </Link>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          disabled={
                            actionMutation.isPending
                          }
                          onClick={() =>
                            markItem(
                              item,
                              "consumed",
                            )
                          }
                        >
                          {consuming ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Utensils className="mr-1.5 h-3.5 w-3.5" />
                          )}

                          Consumed
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full sm:w-auto"
                          disabled={
                            actionMutation.isPending
                          }
                          onClick={() =>
                            markItem(
                              item,
                              "wasted",
                            )
                          }
                        >
                          {wasting ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          )}

                          Wasted
                        </Button>

                        <Link
                          to="/recipes"
                          className="contents sm:block"
                        >
                          <Button
                            size="sm"
                            className="w-full bg-gradient-pink text-white sm:w-auto"
                          >
                            <ChefHat className="mr-1.5 h-3.5 w-3.5" />

                            Recipe
                          </Button>
                        </Link>
                      </div>
                    </motion.article>
                  );
                },
              )}
            </div>

            {hiddenItemCount > 0 && (
              <div className="flex justify-center pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setShowAll(
                      (current) =>
                        !current,
                    )
                  }
                >
                  {showAll ? (
                    <ChevronUp className="mr-2 h-4 w-4" />
                  ) : (
                    <ChevronDown className="mr-2 h-4 w-4" />
                  )}

                  {showAll
                    ? "Show fewer items"
                    : `Show ${hiddenItemCount} more item${
                        hiddenItemCount ===
                        1
                          ? ""
                          : "s"
                      }`}
                </Button>
              </div>
            )}
          </>
        )}
    </div>
  );
}