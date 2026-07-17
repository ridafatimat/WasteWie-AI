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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type {
  PantryItem,
  PantryItemCreate,
  PantryItemUpdate,
} from "@/types";
import {
  extractApiError,
  parseFieldErrors,
} from "@/services/api/client";
import {
  createPantryItem,
  updatePantryItem,
} from "@/services/api";
import { toast } from "sonner";

const CATEGORIES = [
  "beverage",
  "dairy",
  "fruit",
  "grain",
  "meat",
  "snack",
  "vegetable",
] as const;

const LOCATIONS = [
  "fridge",
  "freezer",
  "pantry",
] as const;

type FormState = {
  product_name: string;
  category: string;
  quantity: number;
  unit: string;
  purchase_date: string;
  expiry_date: string;
  storage_location: string;
  currency: string;
};

const createEmptyForm = (): FormState => ({
  product_name: "",
  category: "dairy",
  quantity: 1,
  unit: "unit",
  purchase_date: new Date().toISOString().slice(0, 10),
  expiry_date: new Date(
    Date.now() + 7 * 86400000,
  )
    .toISOString()
    .slice(0, 10),
  storage_location: "fridge",
  currency: "PKR",
});

export function PantryFormDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  item?: PantryItem | null;
  onSaved: () => void | Promise<void>;
}) {
  const isEdit = Boolean(item);

  const [form, setForm] = useState<FormState>(
    createEmptyForm(),
  );
  const [priceAmount, setPriceAmount] =
    useState<string>("");
  const [loading, setLoading] =
    useState(false);
  const [fieldErrors, setFieldErrors] =
    useState<Record<string, string>>({});
  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setError(null);
    setFieldErrors({});

    if (item) {
      setForm({
        product_name: item.product_name || "",
        category: item.category || "dairy",
        quantity:
          item.quantity_remaining ??
          item.quantity ??
          1,
        unit: item.unit || "unit",
        purchase_date:
          item.purchase_date?.slice(0, 10) ||
          createEmptyForm().purchase_date,
        expiry_date:
          item.expiry_date?.slice(0, 10) ||
          createEmptyForm().expiry_date,
        storage_location:
          item.storage_location || "fridge",
        currency:
          item.price?.currency ||
          item.currency ||
          "PKR",
      });

      const existingPrice =
        item.price?.amount ??
        item.price_amount;

      setPriceAmount(
        existingPrice != null
          ? String(existingPrice)
          : "",
      );
    } else {
      setForm(createEmptyForm());
      setPriceAmount("");
    }
  }, [open, item]);

  const submit = async () => {
    setLoading(true);
    setError(null);
    setFieldErrors({});

    try {
      if (isEdit && item) {
        const payload: PantryItemUpdate = {
          product_name:
            form.product_name.trim(),
          category:
            form.category.toLowerCase(),
          quantity_remaining: Number(
            form.quantity,
          ),
          unit: form.unit.trim(),
          purchase_date:
            form.purchase_date,
          expiry_date:
            form.expiry_date || null,
          storage_location:
            form.storage_location.toLowerCase(),
        };

        await updatePantryItem(
          item.id,
          payload,
        );

        toast.success(
          "Pantry item updated",
        );
      } else {
        const payload: PantryItemCreate = {
          product_name:
            form.product_name.trim(),
          category:
            form.category.toLowerCase(),
          quantity: Number(
            form.quantity,
          ),
          unit: form.unit.trim(),
          purchase_date:
            form.purchase_date,
          expiry_date:
            form.expiry_date || null,
          storage_location:
            form.storage_location.toLowerCase(),
        };

        if (priceAmount !== "") {
          payload.price = {
            amount: Number(priceAmount),
            currency:
              form.currency
                .trim()
                .toUpperCase() || "PKR",
          };
        }

        await createPantryItem(payload);

        toast.success(
          "Pantry item added",
        );
      }

      await onSaved();
      onOpenChange(false);
    } catch (err) {
      setFieldErrors(
        parseFieldErrors(err),
      );
      setError(
        extractApiError(err),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Edit pantry item"
              : "Add pantry item"}
          </DialogTitle>

          <DialogDescription>
            Fields match the backend
            pantry-item schema.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Product name"
            error={fieldErrors.product_name}
            full
          >
            <Input
              value={form.product_name}
              onChange={(event) =>
                setForm({
                  ...form,
                  product_name:
                    event.target.value,
                })
              }
              placeholder="Milk"
            />
          </Field>

          <Field
            label="Category"
            error={fieldErrors.category}
          >
            <Select
              value={form.category}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  category: value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {CATEGORIES.map(
                  (category) => (
                    <SelectItem
                      key={category}
                      value={category}
                    >
                      {category[0].toUpperCase() +
                        category.slice(1)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Storage location"
            error={
              fieldErrors.storage_location
            }
          >
            <Select
              value={
                form.storage_location
              }
              onValueChange={(value) =>
                setForm({
                  ...form,
                  storage_location: value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {LOCATIONS.map(
                  (location) => (
                    <SelectItem
                      key={location}
                      value={location}
                    >
                      {location[0].toUpperCase() +
                        location.slice(1)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>

          <Field
            label="Quantity"
            error={
              isEdit
                ? fieldErrors.quantity_remaining
                : fieldErrors.quantity
            }
          >
            <Input
              type="number"
              min={0}
              step="0.01"
              value={form.quantity}
              onChange={(event) =>
                setForm({
                  ...form,
                  quantity: Number(
                    event.target.value,
                  ),
                })
              }
            />
          </Field>

          <Field
            label="Unit"
            error={fieldErrors.unit}
          >
            <Input
              value={form.unit}
              onChange={(event) =>
                setForm({
                  ...form,
                  unit: event.target.value,
                })
              }
              placeholder="litre"
            />
          </Field>

          <Field
            label="Purchase date"
            error={
              fieldErrors.purchase_date
            }
          >
            <Input
              type="date"
              value={form.purchase_date}
              onChange={(event) =>
                setForm({
                  ...form,
                  purchase_date:
                    event.target.value,
                })
              }
            />
          </Field>

          <Field
            label="Expiry date"
            error={
              fieldErrors.expiry_date
            }
          >
            <Input
              type="date"
              value={form.expiry_date}
              onChange={(event) =>
                setForm({
                  ...form,
                  expiry_date:
                    event.target.value,
                })
              }
            />
          </Field>

          {!isEdit && (
            <>
              <Field label="Price (optional)">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={priceAmount}
                  onChange={(event) =>
                    setPriceAmount(
                      event.target.value,
                    )
                  }
                  placeholder="320"
                />
              </Field>

              <Field label="Currency">
                <Input
                  value={form.currency}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      currency:
                        event.target.value.toUpperCase(),
                    })
                  }
                  placeholder="PKR"
                />
              </Field>
            </>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() =>
              onOpenChange(false)
            }
            disabled={loading}
          >
            Cancel
          </Button>

          <Button
            onClick={submit}
            disabled={loading}
            className="bg-gradient-pink text-white"
          >
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}

            {isEdit
              ? "Save changes"
              : "Add item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  error,
  full,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
  full?: boolean;
}) {
  return (
    <div
      className={
        full
          ? "sm:col-span-2"
          : ""
      }
    >
      <Label className="text-xs">
        {label}
      </Label>

      <div className="mt-1.5">
        {children}
      </div>

      {error && (
        <p className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}