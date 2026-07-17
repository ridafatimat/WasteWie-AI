import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Package,
  CalendarClock,
  ShieldAlert,
  Sparkles,
  Plus,
  Receipt,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { listPantryItems, getWasteRisk } from "@/services/api";
import { extractApiError } from "@/services/api/client";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Button } from "@/components/ui/button";
import { RiskBadge, RiskScore } from "@/components/RiskBadge";
import { daysUntil, formatDate } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — WasteWise AI" }] }),
  component: () => (
    <RequireAuth>
      <AppShell title="Dashboard">
        <DashboardView />
      </AppShell>
    </RequireAuth>
  ),
});

function useCounter(target: number, ms = 700) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function DashboardView() {
  const pantry = useQuery({ queryKey: ["pantry"], queryFn: listPantryItems, retry: 0 });
  const risks = useQuery({ queryKey: ["risks"], queryFn: getWasteRisk, retry: 0 });

  const items = pantry.data ?? [];
  const expiringSoon = items.filter((i) => {
    const d = daysUntil(i.expiry_date);
    return d != null && d <= 3 && d >= 0;
  });
  const riskItems = (risks.data ?? []).slice().sort((a, b) => b.risk_score - a.risk_score);
  const highRisk = riskItems.filter((r) => (r.risk_band || "").toLowerCase() === "high").length;
  const recentlyAdded = [...items]
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .slice(0, 5);

  const byCategory = Object.entries(
    items.reduce<Record<string, number>>((acc, i) => {
      const k = (i.category as string) || "other";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
  ).map(([category, count]) => ({ category, count }));

  const total = useCounter(items.length);
  const soon = useCounter(expiringSoon.length);
  const high = useCounter(highRisk);
  const recent = useCounter(recentlyAdded.length);

  const err = (pantry.error && !risks.isLoading) || risks.error;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Package} label="Active pantry items" value={total} tone="default" />
        <StatCard icon={CalendarClock} label="Expiring soon (≤3 days)" value={soon} tone="warning" />
        <StatCard icon={ShieldAlert} label="High-risk items" value={high} tone="danger" />
        <StatCard icon={Sparkles} label="Recently added" value={recent} tone="primary" />
      </div>

      {err && (
        <ErrorMessage
          message={extractApiError(pantry.error || risks.error)}
          onRetry={() => {
            pantry.refetch();
            risks.refetch();
          }}
        />
      )}

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-4">
        <QuickAction to="/pantry" icon={Plus} label="Add pantry item" primary />
        <QuickAction to="/rescue-mode" icon={ShieldAlert} label="Open Rescue Mode" />
        <QuickAction to="/receipts" icon={Receipt} label="Upload receipt" />
        <QuickAction to="/pantry" icon={Package} label="View full pantry" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Attention */}
          <Section title="Items needing attention" desc="Expiring in the next 3 days.">
            {pantry.isLoading ? (
              <SkeletonList />
            ) : expiringSoon.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="No urgent items"
                description="Nothing is expiring in the next 3 days."
              />
            ) : (
              <div className="space-y-2">
                {expiringSoon.slice(0, 6).map((i) => {
                  const d = daysUntil(i.expiry_date);
                  return (
                    <Link
                      key={i.id}
                      to="/pantry/$id"
                      params={{ id: i.id }}
                      className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary/40"
                    >
                      <div>
                        <div className="text-sm font-semibold">{i.product_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(i.expiry_date)} · {i.storage_location || "—"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`text-sm font-semibold ${
                            (d ?? 99) <= 0 ? "text-danger" : (d ?? 99) <= 1 ? "text-warning" : "text-foreground"
                          }`}
                        >
                          {d === 0 ? "Today" : d === 1 ? "Tomorrow" : `${d}d left`}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Highest risk */}
          <Section title="Highest waste-risk items">
            {risks.isLoading ? (
              <SkeletonList />
            ) : riskItems.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                title="No risk data yet"
                description="Risk predictions will appear once your pantry has items."
              />
            ) : (
              <div className="space-y-2">
                {riskItems.slice(0, 5).map((r) => (
                  <Link
                    key={r.pantry_item_id}
                    to="/pantry/$id"
                    params={{ id: r.pantry_item_id }}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 transition hover:-translate-y-0.5 hover:border-primary/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{r.product_name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {r.reasons?.[0] ?? r.model_version}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <RiskScore score={r.risk_score} />
                      <RiskBadge band={r.risk_band} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Recently added">
            {pantry.isLoading ? (
              <SkeletonList />
            ) : recentlyAdded.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No pantry items yet"
                description="Add your first grocery item."
                action={
                  <Link to="/pantry">
                    <Button className="bg-gradient-pink text-white">
                      <Plus className="mr-1.5 h-4 w-4" /> Add item
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="space-y-2">
                {recentlyAdded.map((i) => (
                  <Link
                    key={i.id}
                    to="/pantry/$id"
                    params={{ id: i.id }}
                    className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2.5 hover:border-primary/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{i.product_name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {i.category} · {i.storage_location || "—"}
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {byCategory.length > 0 && (
            <Section title="Pantry breakdown">
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={byCategory}>
                    <XAxis dataKey="category" stroke="#7F7F8C" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#7F7F8C" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "#18181D",
                        border: "1px solid #303038",
                        borderRadius: 12,
                      }}
                    />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill="#FF2F87" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: number;
  tone: "default" | "warning" | "danger" | "primary";
}) {
  const toneCls =
    tone === "warning"
      ? "text-warning bg-warning/10"
      : tone === "danger"
        ? "text-danger bg-danger/10"
        : tone === "primary"
          ? "text-primary bg-primary/10"
          : "text-foreground bg-card-elevated";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      whileHover={{ y: -3 }}
      className="rounded-2xl border border-border bg-card p-5 transition hover:border-primary/30"
    >
      <div className="flex items-center justify-between">
        <div className={`grid h-10 w-10 place-items-center rounded-xl ${toneCls}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </motion.div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
  primary,
}: {
  to: string;
  icon: any;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-2xl border p-4 transition hover:-translate-y-0.5 ${
        primary
          ? "border-primary/40 bg-primary/10 hover:border-primary shadow-glow"
          : "border-border bg-card hover:border-primary/40"
      }`}
    >
      <div
        className={`grid h-10 w-10 place-items-center rounded-xl ${
          primary ? "bg-gradient-pink text-white" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-sm font-semibold">{label}</div>
      <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
    </Link>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl border border-border bg-card-elevated/60" />
      ))}
    </div>
  );
}
