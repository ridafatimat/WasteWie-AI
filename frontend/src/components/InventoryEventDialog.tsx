import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { EventType, PantryItem } from "@/types";
import { createInventoryEvent } from "@/services/api";
import { extractApiError } from "@/services/api/client";
import { toast } from "sonner";

const TYPES: EventType[] = ["consumed", "wasted", "expired", "adjusted"];

export function InventoryEventDialog({
  item,
  open,
  onOpenChange,
  defaultType,
  onSaved,
}: {
  item: PantryItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultType?: EventType;
  onSaved: () => void;
}) {
  const [type, setType] = useState<EventType>(defaultType || "consumed");
  const [qty, setQty] = useState<string>("1");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setType(defaultType || "consumed");
      setQty(String(item?.quantity_remaining ?? item?.quantity ?? 1));
      setNotes("");
      setError(null);
    }
  }, [open, defaultType, item]);

  const submit = async () => {
    if (!item) return;
    const n = Number(qty);
    if (!(n > 0)) {
      setError("Quantity must be greater than 0.");
      return;
    }
    const remaining = item.quantity_remaining ?? item.quantity;
    if ((type === "consumed" || type === "wasted") && remaining != null && n > remaining) {
      setError(`Quantity cannot exceed remaining (${remaining}).`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createInventoryEvent(item.id, {
        event_type: type,
        quantity: n,
        occurred_at: new Date().toISOString(),
        notes: notes || undefined,
      });
      toast.success("Event recorded");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record inventory event</DialogTitle>
          <DialogDescription>
            {item?.product_name ? `Item: ${item.product_name}` : "Log an event for this item."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Event type</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Quantity</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Used in tea"
              className="mt-1.5"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading} className="bg-gradient-pink text-white">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Record event
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
