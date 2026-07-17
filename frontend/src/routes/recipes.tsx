import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChefHat, Loader2, Sparkles } from "lucide-react";
import { RequireAuth } from "@/components/RequireAuth";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { getRecipeRecommendations } from "@/services/api";
import { extractApiError } from "@/services/api/client";
import { EmptyState } from "@/components/EmptyState";

export const Route = createFileRoute("/recipes")({
  head: () => ({ meta: [{ title: "Recipes — WasteWise AI" }] }),
  component: () => (
    <RequireAuth>
      <AppShell title="Recipe Suggestions">
        <View />
      </AppShell>
    </RequireAuth>
  ),
});

function View() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notImplemented, setNotImplemented] = useState(false);
  const [data, setData] = useState<any | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    setNotImplemented(false);
    try {
      const res = await getRecipeRecommendations({});
      setData(res);
    } catch (err) {
      const status = (err as any)?.response?.status;
      if (status === 404 || status === 501) setNotImplemented(true);
      else setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-primary">
          <ChefHat className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-widest">Recipes</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Future recipes will prioritise ingredients approaching expiry.
        </p>
        <div className="mt-4">
          <Button onClick={load} disabled={loading} className="bg-gradient-pink text-white">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Suggest recipes
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/30 bg-danger/10 p-5 text-sm text-danger">
          {error}
        </div>
      )}

      {notImplemented && (
        <EmptyState
          icon={ChefHat}
          title="Coming next"
          description="Recipe recommendations will become available after the recipe service is connected."
        />
      )}

      {data && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-2 text-sm font-semibold">Response</div>
          <pre className="max-h-96 overflow-auto rounded-lg bg-background p-3 text-xs text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
