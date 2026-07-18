import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  "other",
] as const;

const LOCATIONS = [
  "fridge",
  "freezer",
  "pantry",
  "unknown",
] as const;

type FormState = {
  product_name: string;
  category: string;
  quantity: string;
  unit: string;
  purchase_date: string;
  expiry_date: string;
  storage_location: string;
  currency: string;
};

/*
 * The older frontend type used quantity_remaining, while the backend PATCH
 * schema intentionally accepts the API-friendly field "quantity".
 *
 * Keeping this local request type makes the payload correct even before the
 * shared PantryItemUpdate type is cleaned up.
 */
type PantryUpdateRequest = Omit<
  PantryItemUpdate,
  "quantity_remaining"
> & {
  quantity: number;
};

const createEmptyForm = (): FormState => ({
  product_name: "",
  category: "dairy",
  quantity: "1",
  unit: "unit",
  purchase_date: new Date()
    .toISOString()
    .slice(0, 10),
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
  const queryClient = useQueryClient();
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
        product_name:
          item.product_name || "",
        category:
          item.category || "dairy",
        quantity: String(
          item.quantity_remaining ??
            item.quantity ??
            1,
        ),
        unit: item.unit || "unit",
        purchase_date:
          item.purchase_date?.slice(
            0,
            10,
          ) ||
          createEmptyForm().purchase_date,
        expiry_date:
          item.expiry_date?.slice(
            0,
            10,
          ) ||
          createEmptyForm().expiry_date,
        storage_location:
          item.storage_location ||
          "fridge",
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
    setError(null);
    setFieldErrors({});

    const validationErrors: Record<
      string,
      string
    > = {};

    const productName =
      form.product_name.trim();
    const unit = form.unit.trim();
    const quantity = Number(
      form.quantity,
    );

    if (!productName) {
      validationErrors.product_name =
        "Product name is required.";
    }

    if (!unit) {
      validationErrors.unit =
        "Unit is required.";
    }

    if (
      form.quantity.trim() === "" ||
      !Number.isFinite(quantity)
    ) {
      validationErrors.quantity =
        "Enter a valid quantity.";
    } else if (quantity < 0) {
      validationErrors.quantity =
        "Quantity cannot be negative.";
    } else if (
      !isEdit &&
      quantity <= 0
    ) {
      validationErrors.quantity =
        "A new pantry item must have a quantity greater than zero.";
    }

    if (
      form.expiry_date &&
      form.purchase_date &&
      form.expiry_date <
        form.purchase_date
    ) {
      validationErrors.expiry_date =
        "Expiry date must be on or after the purchase date.";
    }

    if (
      priceAmount !== "" &&
      (
        !Number.isFinite(
          Number(priceAmount),
        ) ||
        Number(priceAmount) < 0
      )
    ) {
      validationErrors.price =
        "Enter a valid non-negative price.";
    }

    if (
      Object.keys(validationErrors)
        .length > 0
    ) {
      setFieldErrors(
        validationErrors,
      );
      return;
    }

    setLoading(true);

    try {
      if (isEdit && item) {
        /*
         * IMPORTANT:
         * The backend PATCH schema expects "quantity", not
         * "quantity_remaining". The service then maps quantity to the
         * database quantity_remaining column and changes status to
         * consumed when the value reaches zero.
         */
        const payload: PantryUpdateRequest = {
          product_name: productName,
          category:
            form.category.toLowerCase(),
          quantity,
          unit,
          purchase_date:
            form.purchase_date,
          expiry_date:
            form.expiry_date || null,
          storage_location:
            form.storage_location.toLowerCase(),
        };

        const updatedItem =
          await updatePantryItem(
            item.id,
            payload,
          );

        const savedQuantity = Number(
          updatedItem.quantity_remaining ??
            updatedItem.quantity,
        );

        /*
         * Do not display a false success message if the server ignored
         * the requested quantity for any reason.
         */
        if (
          !Number.isFinite(
            savedQuantity,
          ) ||
          Math.abs(
            savedQuantity - quantity,
          ) > 1e-9
        ) {
          throw new Error(
            "The server did not save the requested quantity. Please try again.",
          );
        }

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["pantry"],
          }),
          queryClient.invalidateQueries({
            queryKey: [
              "events",
              item.id,
            ],
          }),
          queryClient.invalidateQueries({
            queryKey: [
              "all-events",
            ],
          }),
          queryClient.invalidateQueries({
            queryKey: ["risks"],
          }),
          queryClient.invalidateQueries({
            queryKey: [
              "grocery-list",
            ],
          }),
        ]);

        await onSaved();

        toast.success(
          quantity === 0
            ? "Pantry item marked as consumed"
            : "Pantry item updated",
        );
      } else {
        const payload: PantryItemCreate = {
          product_name: productName,
          category:
            form.category.toLowerCase(),
          quantity,
          unit,
          purchase_date:
            form.purchase_date,
          expiry_date:
            form.expiry_date || null,
          storage_location:
            form.storage_location.toLowerCase(),
        };

        if (priceAmount !== "") {
          payload.price = {
            amount:
              Number(priceAmount),
            currency:
              form.currency
                .trim()
                .toUpperCase() ||
              "PKR",
          };
        }

        await createPantryItem(
          payload,
        );

        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ["pantry"],
          }),
          queryClient.invalidateQueries({
            queryKey: ["risks"],
          }),
          queryClient.invalidateQueries({
            queryKey: [
              "grocery-list",
            ],
          }),
        ]);

        await onSaved();

        toast.success(
          "Pantry item added",
        );
      }

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
      onOpenChange={(value) => {
        if (!loading) {
          onOpenChange(value);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? "Edit pantry item"
              : "Add pantry item"}
          </DialogTitle>

          <DialogDescription>
            {isEdit
              ? "Update this purchase batch. Setting the quantity to 0 marks it as consumed."
              : "Add a new purchase batch to the household pantry."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Product name"
            error={
              fieldErrors.product_name
            }
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
            error={
              fieldErrors.category
            }
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
              fieldErrors.quantity
            }
          >
            <Input
              type="number"
              min={isEdit ? 0 : 0.01}
              step="0.01"
              value={form.quantity}
              onChange={(event) =>
                setForm({
                  ...form,
                  quantity:
                    event.target.value,
                })
              }
            />

            {isEdit && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Enter 0 when none of this
                batch remains.
              </p>
            )}
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
                  unit:
                    event.target.value,
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
              value={
                form.purchase_date
              }
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
              <Field
                label="Price (optional)"
                error={
                  fieldErrors.price
                }
              >
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
            {loading && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}

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