import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Filter,
  History as HistoryIcon,
  Package,
  ShieldAlert,
  Sparkles,
  Trash2,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import {
  listInventoryEvents,
  listPantryItems,
} from "@/services/api";
import { extractApiError } from "@/services/api/client";
import { EmptyState } from "@/components/EmptyState";
import { ErrorMessage } from "@/components/ErrorMessage";
import {
  cap,
  formatDateTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      {
        title:
          "History & Waste Analytics — WasteWise AI",
      },
    ],
  }),

  component: () => (
    <RequireAuth>
      <AppShell title="Inventory History">
        <HistoryView />
      </AppShell>
    </RequireAuth>
  ),
});

type HistoryEvent = {
  id: string;
  pantry_item_id: string;
  product_name: string;
  unit?: string | null;
  event_type: string;
  quantity: number | null;
  occurred_at: string;
  notes?: string | null;
  derived?: boolean;
};

const chartTooltipStyle = {
  background: "#18181d",
  border: "1px solid #303038",
  borderRadius: "12px",
  color: "#ffffff",
  boxShadow:
    "0 18px 45px rgba(0, 0, 0, 0.35)",
};

const outcomeColours: Record<string, string> = {
  Consumed: "#46D66A",
  Wasted: "#FF4D6D",
  Expired: "#F6B51B",
};

function getTodayDateKey(): string {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(
    today.getMonth() + 1,
  ).padStart(2, "0");
  const day = String(
    today.getDate(),
  ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeDateKey(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const dateKey = String(value).slice(0, 10);

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)
  ) {
    return null;
  }

  return dateKey;
}

function expiryDateToTimestamp(
  expiryDate: string,
): string {
  /*
   * Midday is used so timezone conversion does not
   * accidentally move the event to the previous date.
   */
  const timestamp = new Date(
    `${expiryDate}T12:00:00`,
  );

  if (
    Number.isNaN(timestamp.getTime())
  ) {
    return new Date().toISOString();
  }

  return timestamp.toISOString();
}

function HistoryView() {
  const pantry = useQuery({
    queryKey: ["pantry"],
    queryFn: listPantryItems,
    retry: 0,
  });

  const items = pantry.data ?? [];

  /*
   * The current backend exposes history per pantry item.
   * This combines every item event into household history.
   */
  const eventsQuery = useQuery({
    queryKey: [
      "all-events",
      items.map((item) => item.id),
    ],

    queryFn: async (): Promise<
      HistoryEvent[]
    > => {
      const eventGroups =
        await Promise.all(
          items.map(async (item) => {
            const events =
              await listInventoryEvents(
                item.id,
              );

            return events.map(
              (event) => ({
                ...event,
                id: event.id,
                product_name:
                  item.product_name,
                pantry_item_id: item.id,
                unit: item.unit,
                derived: false,
              }),
            );
          }),
        );

      return eventGroups.flat();
    },

    enabled: items.length > 0,
    retry: 0,
  });

  const [filterType, setFilterType] =
    useState<string>("all");

  /*
   * Some products may already be past their expiry
   * date without having an explicit expired event.
   *
   * These are turned into temporary derived events
   * for analytics and history display.
   */
  const derivedExpiredEvents =
    useMemo<HistoryEvent[]>(() => {
      const actualEvents =
        eventsQuery.data ?? [];

      const recordedExpiredItemIds =
        new Set(
          actualEvents
            .filter(
              (event) =>
                event.event_type ===
                "expired",
            )
            .map(
              (event) =>
                event.pantry_item_id,
            ),
        );

      const todayDateKey =
        getTodayDateKey();

      return items.flatMap((item) => {
        const expiryDate =
          normalizeDateKey(
            item.expiry_date,
          );

        if (!expiryDate) {
          return [];
        }

        /*
         * Today is not automatically expired.
         * Only dates before today are included.
         */
        if (
          expiryDate >= todayDateKey
        ) {
          return [];
        }

        /*
         * Do not duplicate a real expired event.
         */
        if (
          recordedExpiredItemIds.has(
            item.id,
          )
        ) {
          return [];
        }

        const statusValue = String(
          item.status || "",
        ).toLowerCase();

        /*
         * Consumed and wasted items should not later
         * be inferred as expired.
         */
        if (
          statusValue === "consumed" ||
          statusValue === "wasted"
        ) {
          return [];
        }

        const remainingQuantity =
          Number(
            item.quantity_remaining ?? 0,
          );

        /*
         * Active items require remaining stock.
         * Explicitly expired items are still shown.
         */
        if (
          remainingQuantity <= 0 &&
          statusValue !== "expired"
        ) {
          return [];
        }

        return [
          {
            id: `derived-expired-${item.id}`,
            pantry_item_id: item.id,
            product_name:
              item.product_name,
            unit: item.unit,
            event_type: "expired",
            quantity:
              remainingQuantity > 0
                ? remainingQuantity
                : null,
            occurred_at:
              expiryDateToTimestamp(
                expiryDate,
              ),
            notes:
              "Automatically identified from the recorded expiry date",
            derived: true,
          },
        ];
      });
    }, [
      items,
      eventsQuery.data,
    ]);

  const allEvents = useMemo(() => {
    const actualEvents =
      eventsQuery.data ?? [];

    return [
      ...actualEvents,
      ...derivedExpiredEvents,
    ].sort(
      (
        firstEvent,
        secondEvent,
      ) =>
        (
          secondEvent.occurred_at ||
          ""
        ).localeCompare(
          firstEvent.occurred_at ||
            "",
        ),
    );
  }, [
    eventsQuery.data,
    derivedExpiredEvents,
  ]);

  const consumedEvents =
    useMemo(
      () =>
        allEvents.filter(
          (event) =>
            event.event_type ===
            "consumed",
        ),
      [allEvents],
    );

  const wastedEvents = useMemo(
    () =>
      allEvents.filter(
        (event) =>
          event.event_type ===
          "wasted",
      ),
    [allEvents],
  );

  const expiredEvents = useMemo(
    () =>
      allEvents.filter(
        (event) =>
          event.event_type ===
          "expired",
      ),
    [allEvents],
  );

  /*
   * Food waste includes manually wasted
   * and expired products.
   */
  const wasteEvents = useMemo(
    () => [
      ...wastedEvents,
      ...expiredEvents,
    ],
    [
      wastedEvents,
      expiredEvents,
    ],
  );

  const uniqueWasteProducts =
    useMemo(() => {
      return new Set(
        wasteEvents.map(
          (event) =>
            event.pantry_item_id,
        ),
      ).size;
    }, [wasteEvents]);

  const outcomeTotal =
    consumedEvents.length +
    wastedEvents.length +
    expiredEvents.length;

  const wasteRate =
    outcomeTotal > 0
      ? Math.round(
          (wasteEvents.length /
            outcomeTotal) *
            100,
        )
      : 0;

  const outcomeData = useMemo(
    () =>
      [
        {
          name: "Consumed",
          value:
            consumedEvents.length,
        },
        {
          name: "Wasted",
          value:
            wastedEvents.length,
        },
        {
          name: "Expired",
          value:
            expiredEvents.length,
        },
      ].filter(
        (entry) => entry.value > 0,
      ),
    [
      consumedEvents.length,
      wastedEvents.length,
      expiredEvents.length,
    ],
  );

  /*
   * Aggregate wasted and expired records
   * by month for the trend graph.
   */
  const wasteTrend = useMemo(() => {
    const monthMap = new Map<
      string,
      {
        key: string;
        month: string;
        wasted: number;
        expired: number;
        total: number;
      }
    >();

    wasteEvents.forEach((event) => {
      const occurredAt = new Date(
        event.occurred_at,
      );

      if (
        Number.isNaN(
          occurredAt.getTime(),
        )
      ) {
        return;
      }

      const monthKey = `${occurredAt.getFullYear()}-${String(
        occurredAt.getMonth() + 1,
      ).padStart(2, "0")}`;

      const monthLabel =
        new Intl.DateTimeFormat(
          "en",
          {
            month: "short",
            year: "2-digit",
          },
        ).format(occurredAt);

      const existing =
        monthMap.get(monthKey) ?? {
          key: monthKey,
          month: monthLabel,
          wasted: 0,
          expired: 0,
          total: 0,
        };

      if (
        event.event_type ===
        "wasted"
      ) {
        existing.wasted += 1;
      }

      if (
        event.event_type ===
        "expired"
      ) {
        existing.expired += 1;
      }

      existing.total += 1;

      monthMap.set(
        monthKey,
        existing,
      );
    });

    return [
      ...monthMap.values(),
    ]
      .sort(
        (
          firstMonth,
          secondMonth,
        ) =>
          firstMonth.key.localeCompare(
            secondMonth.key,
          ),
      )
      .slice(-6);
  }, [wasteEvents]);

  const filteredRows = useMemo(() => {
    if (filterType === "all") {
      return allEvents;
    }

    if (filterType === "waste") {
      return allEvents.filter(
        (event) =>
          event.event_type ===
            "wasted" ||
          event.event_type ===
            "expired",
      );
    }

    return allEvents.filter(
      (event) =>
        event.event_type ===
        filterType,
    );
  }, [
    allEvents,
    filterType,
  ]);

  const isLoading =
    pantry.isLoading ||
    (items.length > 0 &&
      eventsQuery.isLoading);

  const error =
    pantry.error ||
    eventsQuery.error;

  if (error) {
    return (
      <ErrorMessage
        message={extractApiError(
          error,
        )}
        onRetry={() => {
          pantry.refetch();
          eventsQuery.refetch();
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[32px] border border-primary/20 bg-card"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_0%,rgba(255,46,139,0.18),transparent_32%),radial-gradient(circle_at_94%_100%,rgba(246,181,27,0.10),transparent_32%)]" />
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full border border-primary/10" />

        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-primary">
              <Activity className="h-3.5 w-3.5" />
              Household analytics
            </div>
            <h2 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">
              See where food goes, then waste less next time.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
              Consumption, manual waste and expiry records are combined into one clear household view. Expired stock without a saved event is still detected automatically.
            </p>
          </div>

          <div className="grid min-w-[280px] gap-3 rounded-[24px] border border-white/10 bg-background/70 p-4 backdrop-blur-xl sm:grid-cols-[auto_1fr] sm:items-center lg:grid-cols-1">
            <div className="flex items-center gap-4">
              <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full bg-[conic-gradient(hsl(var(--primary))_0_var(--rate),hsl(var(--muted))_var(--rate)_100%)] p-1.5" style={{ "--rate": `${wasteRate}%` } as CSSProperties}>
                <div className="grid h-full w-full place-items-center rounded-full bg-card text-center">
                  <div>
                    <p className="text-xl font-bold tabular-nums">{wasteRate}%</p>
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Waste rate</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current outcome mix</p>
                <p className="mt-1 text-sm font-medium">{wasteEvents.length} waste event{wasteEvents.length === 1 ? "" : "s"} from {outcomeTotal} recorded outcomes</p>
              </div>
            </div>

            <div className="border-t border-border/70 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-3">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Filter className="h-3.5 w-3.5" />
                Filter timeline
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-10 bg-card/70">
                  <SelectValue placeholder="Event type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  <SelectItem value="waste">All food waste</SelectItem>
                  <SelectItem value="consumed">Consumed</SelectItem>
                  <SelectItem value="wasted">Wasted</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="adjusted">Adjusted</SelectItem>
                  <SelectItem value="updated">Updated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </motion.section>

      {isLoading ? (
        <HistoryPageSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AnalyticsCard
              icon={Trash2}
              label="Total waste events"
              value={wasteEvents.length}
              description="Wasted and expired records"
              tone="danger"
            />
            <AnalyticsCard
              icon={Package}
              label="Products affected"
              value={uniqueWasteProducts}
              description="Unique pantry batches affected"
              tone="primary"
            />
            <AnalyticsCard
              icon={ShieldAlert}
              label="Wasted"
              value={wastedEvents.length}
              description="Manually recorded as wasted"
              tone="danger"
            />
            <AnalyticsCard
              icon={CalendarClock}
              label="Expired"
              value={expiredEvents.length}
              description="Reached expiry before use"
              tone="warning"
            />
          </div>

          {allEvents.length === 0 ? (
            <EmptyState
              icon={HistoryIcon}
              title="No inventory history yet"
              description="Record consumed, wasted, expired or adjusted events to build household waste analytics."
            />
          ) : (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <ChartCard
                  icon={BarChart3}
                  title="Food outcome breakdown"
                  description="Consumed, wasted and expired outcomes at a glance."
                  badge={`Waste rate ${wasteRate}%`}
                >
                  {outcomeData.length === 0 ? (
                    <ChartEmptyState message="Record consumed, wasted or expired events to create this chart." />
                  ) : (
                    <div className="relative h-[320px]">
                      <div className="pointer-events-none absolute inset-0 grid place-items-center pb-8">
                        <div className="text-center">
                          <p className="text-3xl font-bold tabular-nums">{outcomeTotal}</p>
                          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Outcomes</p>
                        </div>
                      </div>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={outcomeData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="45%"
                            innerRadius={76}
                            outerRadius={112}
                            paddingAngle={5}
                            cornerRadius={7}
                            stroke="transparent"
                          >
                            {outcomeData.map((entry) => (
                              <Cell key={entry.name} fill={outcomeColours[entry.name]} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={chartTooltipStyle} itemStyle={{ color: "#ffffff" }} />
                          <Legend verticalAlign="bottom" iconType="circle" />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>

                <ChartCard
                  icon={TrendingDown}
                  title="Waste trend"
                  description="Wasted and expired events across recent months."
                  badge={`${wasteTrend.length} month${wasteTrend.length === 1 ? "" : "s"}`}
                >
                  {wasteTrend.length === 0 ? (
                    <ChartEmptyState message="Monthly waste trends will appear after wasted or expired events are recorded." />
                  ) : (
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={wasteTrend} margin={{ top: 18, right: 16, left: -20, bottom: 4 }}>
                          <CartesianGrid stroke="#292930" strokeDasharray="4 4" vertical={false} />
                          <XAxis dataKey="month" stroke="#7f7f8c" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis allowDecimals={false} stroke="#7f7f8c" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={chartTooltipStyle} labelStyle={{ color: "#ffffff" }} />
                          <Legend />
                          <Line
                            type="monotone"
                            dataKey="wasted"
                            name="Wasted"
                            stroke="#FF4D6D"
                            strokeWidth={3}
                            dot={{ r: 4, fill: "#FF4D6D", strokeWidth: 0 }}
                            activeDot={{ r: 6 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="expired"
                            name="Expired"
                            stroke="#F6B51B"
                            strokeWidth={3}
                            dot={{ r: 4, fill: "#F6B51B", strokeWidth: 0 }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </ChartCard>
              </div>

              <TimelineSection filterType={filterType} rows={filteredRows} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function AnalyticsCard({
  icon: Icon,
  label,
  value,
  description,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  description: string;
  tone: "primary" | "danger" | "warning";
}) {
  const toneClasses = tone === "danger"
    ? "bg-danger/10 text-danger border-danger/15"
    : tone === "warning"
      ? "bg-warning/10 text-warning border-warning/15"
      : "bg-primary/10 text-primary border-primary/15";

  const accent = tone === "danger"
    ? "from-danger/70"
    : tone === "warning"
      ? "from-warning/70"
      : "from-primary/70";

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 transition hover:border-primary/25 hover:shadow-xl hover:shadow-black/10"
    >
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent", accent)} />
      <div className="flex items-start justify-between gap-3">
        <div className={cn("grid h-11 w-11 place-items-center rounded-2xl border", toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
        <CircleDot className="h-4 w-4 text-muted-foreground/25 transition group-hover:text-primary/40" />
      </div>

      <div className="mt-5 text-3xl font-bold tabular-nums">{value}</div>
      <div className="mt-1 text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
    </motion.article>
  );
}

function ChartCard({
  icon: Icon,
  title,
  description,
  badge,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.35 }}
      className="overflow-hidden rounded-[28px] border border-border bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 bg-gradient-to-r from-primary/[0.06] to-transparent px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>

        {badge && (
          <div className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            {badge}
          </div>
        )}
      </div>

      <div className="p-4 sm:p-5">{children}</div>
    </motion.section>
  );
}

function TimelineSection({
  filterType,
  rows,
}: {
  filterType: string;
  rows: HistoryEvent[];
}) {
  const groupedRows = useMemo(() => {
    const groups = new Map<string, HistoryEvent[]>();

    for (const event of rows) {
      const parsed = new Date(event.occurred_at);
      const key = Number.isNaN(parsed.getTime())
        ? "Unknown date"
        : new Intl.DateTimeFormat(undefined, {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          }).format(parsed);

      const group = groups.get(key) ?? [];
      group.push(event);
      groups.set(key, group);
    }

    return Array.from(groups.entries());
  }, [rows]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35 }}
      className="overflow-hidden rounded-[28px] border border-border bg-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/70 bg-gradient-to-r from-primary/[0.06] to-transparent px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
            <HistoryIcon className="h-4.5 w-4.5" />
          </div>
          <div>
            <h2 className="font-semibold">Event timeline</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {filterType === "all"
                ? "Complete household pantry history."
                : filterType === "waste"
                  ? "Showing all wasted and expired events."
                  : `Showing ${filterType} events.`}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-background/50 px-3 py-1.5 text-xs text-muted-foreground">
          {rows.length} event{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="p-5 sm:p-6">
          <EmptyState
            icon={HistoryIcon}
            title="No matching events"
            description="There are no inventory events matching the selected filter."
          />
        </div>
      ) : (
        <div className="space-y-6 p-5 sm:p-6">
          {groupedRows.map(([dateLabel, events]) => (
            <div key={dateLabel}>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{dateLabel}</span>
                <div className="h-px flex-1 bg-border/70" />
                <span className="text-[10px] text-muted-foreground">{events.length}</span>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {events.map((event, index) => {
                  const visual = getEventVisual(event.event_type);
                  const EventIcon = visual.icon;

                  return (
                    <motion.article
                      key={event.id ?? index}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="group rounded-2xl border border-border bg-background/35 p-4 transition hover:-translate-y-0.5 hover:border-primary/25"
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-2xl", visual.className)}>
                          <EventIcon className="h-4 w-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className="font-semibold">{event.product_name}</h3>
                                {event.derived && (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning">
                                    <Sparkles className="h-2.5 w-2.5" />
                                    Auto-detected
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {cap(event.event_type)}
                                {event.quantity !== null && event.quantity !== undefined && (
                                  <> · {event.quantity}{event.unit ? ` ${event.unit}` : ""}</>
                                )}
                              </p>
                            </div>

                            <time className="shrink-0 text-[11px] text-muted-foreground">
                              {formatDateTime(event.occurred_at)}
                            </time>
                          </div>

                          {event.notes && (
                            <p className="mt-3 rounded-xl bg-card/70 px-3 py-2 text-xs leading-5 text-muted-foreground">
                              {event.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.section>
  );
}

function getEventVisual(eventType: string): {
  icon: LucideIcon;
  className: string;
} {
  if (eventType === "wasted") {
    return { icon: Trash2, className: "bg-danger/10 text-danger" };
  }
  if (eventType === "expired") {
    return { icon: CalendarClock, className: "bg-warning/10 text-warning" };
  }
  if (eventType === "consumed") {
    return { icon: CheckCircle2, className: "bg-success/10 text-success" };
  }
  if (eventType === "adjusted") {
    return { icon: Activity, className: "bg-blue-500/10 text-blue-400" };
  }
  return { icon: Package, className: "bg-primary/10 text-primary" };
}

function ChartEmptyState({
  message,
}: {
  message: string;
}) {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border bg-background/20 px-6 text-center">
      <div>
        <HistoryIcon className="mx-auto h-8 w-8 text-muted-foreground/50" />

        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          {message}
        </p>
      </div>
    </div>
  );
}

function HistoryPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map(
          (item) => (
            <div
              key={item}
              className="h-44 animate-pulse rounded-3xl border border-border bg-card/60"
            />
          ),
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="h-[390px] animate-pulse rounded-[28px] border border-border bg-card/60"
          />
        ))}
      </div>

      <div className="h-[420px] animate-pulse rounded-[28px] border border-border bg-card/60" />
    </div>
  );
}

function getEventDotClass(
  eventType: string,
) {
  if (eventType === "wasted") {
    return "bg-danger";
  }

  if (eventType === "expired") {
    return "bg-warning";
  }

  if (eventType === "consumed") {
    return "bg-success";
  }

  if (eventType === "adjusted") {
    return "bg-blue-500";
  }

  return "bg-gradient-pink";
}