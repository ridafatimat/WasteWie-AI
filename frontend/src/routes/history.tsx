import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { History as HistoryIcon } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { listInventoryEvents, listPantryItems } from "@/services/api";
import { extractApiError } from "@/services/api/client";
import { EmptyState } from "@/components/EmptyState";
import { ErrorMessage } from "@/components/ErrorMessage";
import { cap, formatDateTime } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "History — WasteWise AI" }] }),
  component: () => (
    <RequireAuth>
      <AppShell title="Inventory History">
        <View />
      </AppShell>
    </RequireAuth>
  ),
});

function View() {
  const pantry = useQuery({ queryKey: ["pantry"], queryFn: listPantryItems, retry: 0 });
  const items = pantry.data ?? [];

  // Aggregate events from each pantry item (backend may not expose a global endpoint).
  const eventsQ = useQuery({
    queryKey: ["all-events", items.map((i) => i.id)],
    queryFn: async () => {
      const chunks = await Promise.all(
        items.map(async (i) => {
          const evs = await listInventoryEvents(i.id);
          return evs.map((e) => ({ ...e, product_name: i.product_name, pantry_item_id: i.id }));
        }),
      );
      return chunks.flat();
    },
    enabled: items.length > 0,
    retry: 0,
  });

  const [filterType, setFilterType] = useState<string>("all");

  const rows = useMemo(() => {
    const all = eventsQ.data ?? [];
    const filtered = filterType === "all" ? all : all.filter((e) => e.event_type === filterType);
    return filtered.sort((a, b) => (b.occurred_at || "").localeCompare(a.occurred_at || ""));
  }, [eventsQ.data, filterType]);

  if (pantry.error) return <ErrorMessage message={extractApiError(pantry.error)} onRetry={() => pantry.refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A complete timeline of your pantry events.
        </p>
        <div className="w-48">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger><SelectValue placeholder="Event type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="consumed">Consumed</SelectItem>
              <SelectItem value="wasted">Wasted</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="adjusted">Adjusted</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(pantry.isLoading || eventsQ.isLoading) && (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-card/60" />
          ))}
        </div>
      )}

      {!pantry.isLoading && !eventsQ.isLoading && rows.length === 0 && (
        <EmptyState
          icon={HistoryIcon}
          title="No inventory history yet"
          description="Record consumed, wasted, expired or adjusted events to build your timeline."
        />
      )}

      {rows.length > 0 && (
        <ol className="relative space-y-4 border-l border-border pl-5">
          {rows.map((ev, i) => (
            <li key={ev.id ?? i} className="relative">
              <span className="absolute -left-[27px] top-1 grid h-4 w-4 place-items-center rounded-full bg-gradient-pink shadow-glow" />
              <div className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">{ev.product_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {cap(ev.event_type)} · {ev.quantity}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTime(ev.occurred_at)}
                  </div>
                </div>
                {ev.notes && (
                  <div className="mt-1 text-xs text-muted-foreground">{ev.notes}</div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
