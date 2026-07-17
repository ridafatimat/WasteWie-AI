import { cn } from "@/lib/utils";

export function RiskBadge({ band, className }: { band?: string; className?: string }) {
  const b = (band || "").toLowerCase();
  const styles =
    b === "high"
      ? "bg-danger/15 text-danger border-danger/30"
      : b === "medium"
        ? "bg-warning/15 text-warning border-warning/30"
        : b === "low"
          ? "bg-success/15 text-success border-success/30"
          : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide",
        styles,
        className,
      )}
    >
      {band || "unknown"}
    </span>
  );
}

export function RiskScore({ score }: { score?: number }) {
  const pct = Math.round((score ?? 0) * 100);
  return <span className="tabular-nums font-semibold">{pct}%</span>;
}
