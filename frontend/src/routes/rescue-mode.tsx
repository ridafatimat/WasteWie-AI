import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ShieldAlert, Utensils, Trash2, ChefHat } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { getWasteRisk } from "@/services/api";
import { extractApiError } from "@/services/api/client";
import { ErrorMessage } from "@/components/ErrorMessage";
import { EmptyState } from "@/components/EmptyState";
import { RiskBadge, RiskScore } from "@/components/RiskBadge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/rescue-mode")({
  head: () => ({ meta: [{ title: "Rescue Mode — WasteWise AI" }] }),
  component: () => (
    <RequireAuth>
      <AppShell title="Rescue Mode">
        <View />
      </AppShell>
    </RequireAuth>
  ),
});

function View() {
  const q = useQuery({ queryKey: ["risks"], queryFn: getWasteRisk, retry: 0 });
  const items = (q.data ?? []).slice().sort((a, b) => {
    const rank = (b: string) => ({ high: 0, medium: 1, low: 2 } as any)[b?.toLowerCase()] ?? 3;
    const rb = rank(a.risk_band) - rank(b.risk_band);
    if (rb !== 0) return rb;
    return b.risk_score - a.risk_score;
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-primary/30 bg-primary-dark/40 p-5">
        <div className="flex items-center gap-2 text-primary-soft">
          <ShieldAlert className="h-4 w-4 animate-pulse" />
          <span className="text-xs font-semibold uppercase tracking-widest">Rescue Mode</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Items are ordered by risk band and score. Focus on high-risk items first — they need
          attention today.
        </p>
      </div>

      {q.isLoading && (
        <div className="grid gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-card/60" />
          ))}
        </div>
      )}
      {q.error && <ErrorMessage message={extractApiError(q.error)} onRetry={() => q.refetch()} />}
      {!q.isLoading && !q.error && items.length === 0 && (
        <EmptyState
          icon={ShieldAlert}
          title="No high-risk items right now"
          description="Your pantry is looking good."
        />
      )}

      <div className="grid gap-3">
        {items.map((r, i) => {
          const high = (r.risk_band || "").toLowerCase() === "high";
          return (
            <motion.div
              key={r.pantry_item_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.04 }}
              className={`rounded-2xl border p-5 ${
                high ? "border-primary/50 bg-primary-dark/40 glow-pink" : "border-border bg-card"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to="/pantry/$id" params={{ id: r.pantry_item_id }} className="text-lg font-semibold hover:text-primary">
                    {r.product_name}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Model: {r.model_version}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-bold"><RiskScore score={r.risk_score} /></div>
                  <RiskBadge band={r.risk_band} />
                </div>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full ${
                    high ? "bg-danger" : (r.risk_band || "").toLowerCase() === "medium" ? "bg-warning" : "bg-success"
                  }`}
                  style={{ width: `${Math.round((r.risk_score || 0) * 100)}%` }}
                />
              </div>
              {r.reasons?.length ? (
                <ul className="mt-4 space-y-1">
                  {r.reasons.map((rs, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground">• {rs}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/pantry/$id" params={{ id: r.pantry_item_id }}>
                  <Button size="sm" variant="outline">View item</Button>
                </Link>
                <Link to="/pantry/$id" params={{ id: r.pantry_item_id }}>
                  <Button size="sm" variant="outline">
                    <Utensils className="mr-1.5 h-3.5 w-3.5" /> Consumed
                  </Button>
                </Link>
                <Link to="/pantry/$id" params={{ id: r.pantry_item_id }}>
                  <Button size="sm" variant="outline">
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Wasted
                  </Button>
                </Link>
                <Link to="/recipes">
                  <Button size="sm" className="bg-gradient-pink text-white">
                    <ChefHat className="mr-1.5 h-3.5 w-3.5" /> Find recipe
                  </Button>
                </Link>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
