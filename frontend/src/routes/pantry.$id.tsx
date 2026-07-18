import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CalendarX,
  Clock3,
  Edit2,
  History as HistoryIcon,
  Loader2,
  MapPin,
  Package,
  Scale,
  Sparkles,
  Trash2,
  TrashIcon,
  Utensils,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import {
  deletePantryItem,
  getPantryItem,
  getWasteRisk,
  listInventoryEvents,
} from "@/services/api";
import { extractApiError } from "@/services/api/client";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskScore } from "@/components/RiskBadge";
import { ErrorMessage } from "@/components/ErrorMessage";
import { PantryFormDialog } from "@/components/PantryFormDialog";
import { InventoryEventDialog } from "@/components/InventoryEventDialog";
import { EmptyState } from "@/components/EmptyState";
import {
  cap,
  daysUntil,
  formatDate,
  formatDateTime,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { EventType } from "@/types";
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

export const Route = createFileRoute("/pantry/$id")({
  head: () => ({
    meta: [
      {
        title: "Pantry item — WasteWise AI",
      },
    ],
  }),
  component: () => (
    <RequireAuth>
      <AppShell title="Pantry item">
        <ItemView />
      </AppShell>
    </RequireAuth>
  ),
});

function ItemView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const item = useQuery({
    queryKey: ["pantry", id],
    queryFn: () => getPantryItem(id),
    retry: 0,
  });

  const events = useQuery({
    queryKey: ["events", id],
    queryFn: () => listInventoryEvents(id),
    retry: 0,
  });

  const risks = useQuery({
    queryKey: ["risks"],
    queryFn: getWasteRisk,
    retry: 0,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventType, setEventType] = useState<EventType>("consumed");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const data = item.data;
  const risk = risks.data?.find(
    (entry) => entry.pantry_item_id === id,
  );

  const openEvent = (type: EventType) => {
    setEventType(type);
    setEventOpen(true);
  };

  const doDelete = async () => {
    setDeleting(true);

    try {
      await deletePantryItem(id);
      toast.success("Item deleted");
      navigate({ to: "/pantry" });
    } catch (error) {
      toast.error(extractApiError(error));
    } finally {
      setDeleting(false);
    }
  };

  if (item.isLoading) {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="grid h-14 w-14 place-items-center rounded-2xl border border-primary/20 bg-primary/10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
          <p className="text-sm">Loading pantry details…</p>
        </div>
      </div>
    );
  }

  if (item.error || !data) {
    return (
      <ErrorMessage
        message={extractApiError(item.error)}
        onRetry={() => item.refetch()}
      />
    );
  }

  const expiry = getExpiryPresentation(data.expiry_date);
  const remaining =
    data.quantity_remaining
    ?? data.quantity
    ?? "—";
  const initial =
    data.quantity_initial
    ?? data.quantity
    ?? "—";

  return (
    <div className="mx-auto max-w-[1450px] space-y-6 pb-8">
      <Link
        to="/pantry"
        className="group inline-flex items-center gap-2 rounded-xl px-1 py-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        <span className="grid h-8 w-8 place-items-center rounded-xl border border-border bg-card transition group-hover:border-primary/30 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to Smart Pantry
      </Link>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[30px] border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:p-7"
      >
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-glow">
              <Package className="h-6 w-6" />
            </div>

            <div className="min-w-0">
              <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                <Sparkles className="h-3 w-3" />
                Active pantry batch
              </div>

              <h2 className="break-words text-2xl font-bold tracking-tight sm:text-3xl">
                {data.product_name}
              </h2>

              <div className="mt-3 flex flex-wrap gap-2">
                <Tag>{safeCap(data.category)}</Tag>
                <Tag>{safeCap(data.storage_location)}</Tag>
                {data.status && <Tag>{safeCap(data.status)}</Tag>}
                <span className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  expiry.className,
                )}>
                  {expiry.label}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setEditOpen(true)}
              className="h-11 rounded-2xl bg-background/40"
            >
              <Edit2 className="mr-2 h-4 w-4" />
              Edit item
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(true)}
              className="h-11 rounded-2xl border-danger/25 bg-danger/5 text-danger hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        <div className="relative mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            icon={Package}
            label="Initial quantity"
            value={String(initial)}
            note={data.unit || "unit not set"}
          />
          <InfoCard
            icon={Activity}
            label="Remaining"
            value={`${remaining} ${data.unit ?? ""}`.trim()}
            note="Current available stock"
            highlight
          />
          <InfoCard
            icon={CalendarDays}
            label="Purchased"
            value={formatDate(data.purchase_date)}
            note="Purchase batch date"
          />
          <InfoCard
            icon={Clock3}
            label="Expiry"
            value={formatDate(data.expiry_date)}
            note={expiry.label}
            tone={expiry.tone}
          />
        </div>
      </motion.section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="rounded-[28px] border border-border bg-card p-5 sm:p-6"
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                <HistoryIcon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Item activity</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Consumption, waste and quantity changes over time.
                </p>
              </div>
            </div>

            {events.data?.length ? (
              <span className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-xs text-muted-foreground">
                {events.data.length} event{events.data.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {events.isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className="h-20 animate-pulse rounded-2xl border border-border bg-card-elevated/60"
                />
              ))}
            </div>
          ) : !events.data?.length ? (
            <EmptyState
              icon={HistoryIcon}
              title="No history yet"
              description="Recorded events will appear here as a clean activity timeline."
            />
          ) : (
            <ol className="space-y-3">
              {events.data.map((event, index) => {
                const presentation = getEventPresentation(
                  event.event_type,
                );
                const EventIcon = presentation.icon;

                return (
                  <motion.li
                    key={event.id ?? index}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.035, 0.2) }}
                    className="flex gap-3 rounded-2xl border border-border bg-background/35 p-4 transition hover:border-primary/25"
                  >
                    <div className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-2xl",
                      presentation.iconClass,
                    )}>
                      <EventIcon className="h-4 w-4" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {safeCap(event.event_type)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Quantity: {event.quantity}
                          </p>
                        </div>

                        <time className="text-xs text-muted-foreground">
                          {formatDateTime(event.occurred_at)}
                        </time>
                      </div>

                      {event.notes && (
                        <p className="mt-3 rounded-xl bg-card-elevated/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                          {event.notes}
                        </p>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </ol>
          )}
        </motion.section>

        <div className="space-y-6">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="overflow-hidden rounded-[28px] border border-border bg-card"
          >
            <div className="border-b border-border bg-gradient-to-br from-primary/10 to-transparent p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Waste-risk prediction</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Current model assessment for this batch.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              {risks.isLoading ? (
                <div className="grid place-items-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : risk ? (
                <>
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Predicted risk
                      </p>
                      <div className="mt-2 text-4xl font-bold tabular-nums">
                        <RiskScore score={risk.risk_score} />
                      </div>
                    </div>
                    <RiskBadge band={risk.risk_band} />
                  </div>

                  <div className="mt-5 h-2 overflow-hidden rounded-full bg-background">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.max(
                          0,
                          Math.min(100, (risk.risk_score || 0) * 100),
                        )}%`,
                      }}
                      transition={{ duration: 0.7, delay: 0.2 }}
                      className="h-full rounded-full bg-gradient-pink"
                    />
                  </div>

                  <p className="mt-3 text-xs text-muted-foreground">
                    Model version: {risk.model_version}
                  </p>

                  {risk.reasons?.length ? (
                    <div className="mt-5 space-y-2">
                      {risk.reasons.map((reason, index) => (
                        <div
                          key={index}
                          className="flex gap-2 rounded-xl bg-background/50 p-3 text-xs leading-5 text-muted-foreground"
                        >
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {reason}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="py-5 text-sm text-muted-foreground">
                  No risk prediction is available for this item yet.
                </div>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="rounded-[28px] border border-border bg-card p-5 sm:p-6"
          >
            <div className="mb-4">
              <h3 className="font-semibold">Record an event</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Update stock while keeping the complete batch history.
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <ActionButton
                label="Consumed"
                description="Food was used"
                icon={Utensils}
                onClick={() => openEvent("consumed")}
                tone="success"
              />
              <ActionButton
                label="Wasted"
                description="Food was discarded"
                icon={TrashIcon}
                onClick={() => openEvent("wasted")}
                tone="danger"
              />
              <ActionButton
                label="Expired"
                description="Mark past date"
                icon={CalendarX}
                onClick={() => openEvent("expired")}
                tone="warning"
              />
              <ActionButton
                label="Adjusted"
                description="Correct quantity"
                icon={Scale}
                onClick={() => openEvent("adjusted")}
                tone="primary"
              />
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="rounded-[28px] border border-border bg-card p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <MiniInfo
                icon={MapPin}
                label="Stored in"
                value={safeCap(data.storage_location)}
              />
              <MiniInfo
                icon={CalendarDays}
                label="Purchased"
                value={formatDate(data.purchase_date)}
              />
            </div>
          </motion.section>
        </div>
      </div>

      <PantryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        item={data}
        onSaved={() => {
          item.refetch();
          risks.refetch();
        }}
      />

      <InventoryEventDialog
        item={data}
        open={eventOpen}
        onOpenChange={setEventOpen}
        defaultType={eventType}
        onSaved={() => {
          events.refetch();
          item.refetch();
          risks.refetch();
        }}
      />

      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete this pantry item?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove “{data.product_name}”.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                doDelete();
              }}
              className="bg-danger text-white hover:bg-danger/90"
              disabled={deleting}
            >
              {deleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete item
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Tag({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="rounded-full border border-border bg-background/45 px-2.5 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
  note,
  highlight = false,
  tone = "default",
}: {
  icon: typeof Package;
  label: string;
  value: string;
  note: string;
  highlight?: boolean;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "text-danger bg-danger/10 border-danger/15"
      : tone === "warning"
        ? "text-warning bg-warning/10 border-warning/15"
        : tone === "success"
          ? "text-success bg-success/10 border-success/15"
          : "text-primary bg-primary/10 border-primary/15";

  return (
    <div className={cn(
      "rounded-2xl border p-4 backdrop-blur",
      highlight
        ? "border-primary/25 bg-primary/10"
        : "border-border bg-background/45",
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 truncate text-lg font-semibold">
            {value || "—"}
          </p>
        </div>

        <div className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-xl border",
          toneClass,
        )}>
          <Icon className="h-4 w-4" />
        </div>
      </div>

      <p className="mt-2 truncate text-xs text-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function ActionButton({
  label,
  description,
  icon: Icon,
  onClick,
  tone,
}: {
  label: string;
  description: string;
  icon: typeof Utensils;
  onClick: () => void;
  tone: "success" | "danger" | "warning" | "primary";
}) {
  const toneClass =
    tone === "success"
      ? "bg-success/10 text-success"
      : tone === "danger"
        ? "bg-danger/10 text-danger"
        : tone === "warning"
          ? "bg-warning/10 text-warning"
          : "bg-primary/10 text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-background/40 p-3 text-left transition duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-background/70"
    >
      <span className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-2xl transition group-hover:scale-105",
        toneClass,
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">
          {label}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

function MiniInfo({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-background/45 p-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 truncate text-sm font-medium">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function safeCap(value: string | null | undefined) {
  return value ? cap(value) : "—";
}

function getEventPresentation(eventType: string) {
  const normalized = (eventType || "").toLowerCase();

  if (normalized === "consumed") {
    return {
      icon: Utensils,
      iconClass: "bg-success/10 text-success",
    };
  }

  if (normalized === "wasted") {
    return {
      icon: TrashIcon,
      iconClass: "bg-danger/10 text-danger",
    };
  }

  if (normalized === "expired") {
    return {
      icon: CalendarX,
      iconClass: "bg-warning/10 text-warning",
    };
  }

  return {
    icon: Scale,
    iconClass: "bg-primary/10 text-primary",
  };
}

function getExpiryPresentation(
  expiryDate: string | null | undefined,
) {
  const days = daysUntil(expiryDate);

  if (days === null) {
    return {
      label: "No expiry date",
      className: "bg-muted text-muted-foreground",
      tone: "default" as const,
    };
  }

  if (days < 0) {
    return {
      label: `${Math.abs(days)}d expired`,
      className: "bg-danger/10 text-danger",
      tone: "danger" as const,
    };
  }

  if (days === 0) {
    return {
      label: "Use today",
      className: "bg-danger/10 text-danger",
      tone: "danger" as const,
    };
  }

  if (days <= 3) {
    return {
      label: `${days}d left`,
      className: "bg-warning/10 text-warning",
      tone: "warning" as const,
    };
  }

  return {
    label: "Fresh",
    className: "bg-success/10 text-success",
    tone: "success" as const,
  };
}