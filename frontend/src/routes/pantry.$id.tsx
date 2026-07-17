import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Plus,
  Package,
  Loader2,
  History as HistoryIcon,
  Utensils,
  TrashIcon,
  CalendarX,
  Scale,
} from "lucide-react";
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
import { cap, formatDate, formatDateTime } from "@/lib/format";
import type { EventType } from "@/types";
import { toast } from "sonner";
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
  head: () => ({ meta: [{ title: "Pantry item — WasteWise AI" }] }),
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
  const item = useQuery({ queryKey: ["pantry", id], queryFn: () => getPantryItem(id), retry: 0 });
  const events = useQuery({
    queryKey: ["events", id],
    queryFn: () => listInventoryEvents(id),
    retry: 0,
  });
  const risks = useQuery({ queryKey: ["risks"], queryFn: getWasteRisk, retry: 0 });

  const [editOpen, setEditOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventType, setEventType] = useState<EventType>("consumed");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const data = item.data;
  const risk = risks.data?.find((r) => r.pantry_item_id === id);

  const openEvent = (t: EventType) => {
    setEventType(t);
    setEventOpen(true);
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deletePantryItem(id);
      toast.success("Item deleted");
      navigate({ to: "/pantry" });
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (item.isLoading) {
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (item.error || !data) {
    return <ErrorMessage message={extractApiError(item.error)} onRetry={() => item.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <Link to="/pantry" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to pantry
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Package className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-bold">{data.product_name}</h2>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-border px-2 py-0.5">
                    {cap(data.category as string)}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5">
                    {cap(data.storage_location as string)}
                  </span>
                  {data.status && (
                    <span className="rounded-full border border-border px-2 py-0.5">
                      {cap(data.status)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Edit2 className="mr-1.5 h-3.5 w-3.5" /> Edit
                </Button>
                <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5 text-danger" /> Delete
                </Button>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              <Info label="Initial qty" value={String(data.quantity_initial ?? data.quantity ?? "—")} />
              <Info label="Remaining" value={`${data.quantity_remaining ?? data.quantity ?? "—"} ${data.unit ?? ""}`} />
              <Info label="Purchased" value={formatDate(data.purchase_date)} />
              <Info label="Expires" value={formatDate(data.expiry_date)} />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-4 flex items-center gap-2">
              <HistoryIcon className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Event history</h3>
            </div>
            {events.isLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-card-elevated/60" />
                ))}
              </div>
            ) : !events.data?.length ? (
              <EmptyState
                icon={HistoryIcon}
                title="No history yet"
                description="Recorded events will appear here as a timeline."
              />
            ) : (
              <ol className="relative space-y-4 border-l border-border pl-5">
                {events.data.map((ev, i) => (
                  <li key={ev.id ?? i} className="relative">
                    <span className="absolute -left-[27px] top-1 grid h-4 w-4 place-items-center rounded-full bg-gradient-pink shadow-glow" />
                    <div className="text-sm font-medium">
                      {cap(ev.event_type)} · {ev.quantity}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(ev.occurred_at)}
                    </div>
                    {ev.notes && (
                      <div className="mt-1 text-xs text-muted-foreground">{ev.notes}</div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-3 text-sm font-semibold">Waste-risk prediction</h3>
            {risk ? (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-3xl font-bold"><RiskScore score={risk.risk_score} /></div>
                  <RiskBadge band={risk.risk_band} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Model: {risk.model_version}
                </div>
                {risk.reasons?.length ? (
                  <ul className="mt-4 space-y-1.5">
                    {risk.reasons.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        • {r}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                No risk prediction available for this item.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h3 className="mb-3 text-sm font-semibold">Record event</h3>
            <div className="grid grid-cols-2 gap-2">
              <ActionBtn label="Consumed" icon={Utensils} onClick={() => openEvent("consumed")} />
              <ActionBtn label="Wasted" icon={TrashIcon} onClick={() => openEvent("wasted")} />
              <ActionBtn label="Expired" icon={CalendarX} onClick={() => openEvent("expired")} />
              <ActionBtn label="Adjusted" icon={Scale} onClick={() => openEvent("adjusted")} />
            </div>
          </div>
        </div>
      </div>

      <PantryFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        item={data}
        onSaved={() => item.refetch()}
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this pantry item?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove "{data.product_name}".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doDelete();
              }}
              className="bg-danger text-white"
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card-elevated p-3">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
function ActionBtn({ label, icon: Icon, onClick }: { label: string; icon: any; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl border border-border bg-card-elevated px-3 py-2.5 text-sm transition hover:-translate-y-0.5 hover:border-primary/40"
    >
      <Icon className="h-4 w-4 text-primary" />
      {label}
    </button>
  );
}
