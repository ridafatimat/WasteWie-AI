import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ErrorMessage({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-danger/30 bg-danger/10 p-5">
      <div className="flex items-center gap-2 text-danger">
        <AlertCircle className="h-5 w-5" />
        <span className="font-semibold">Something went wrong</span>
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Try again
        </Button>
      )}
    </div>
  );
}
