import {
  createFileRoute,
  Link,
} from "@tanstack/react-router";
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  FileImage,
  Loader2,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  Store,
  UploadCloud,
  WalletCards,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  motion,
} from "framer-motion";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  uploadReceipt,
} from "@/services/api";
import {
  extractApiError,
} from "@/services/api/client";
import type {
  PantryReceiptChange,
  ReceiptItem,
  ReceiptProcessResponse,
} from "@/types/receipt";

export const Route = createFileRoute("/receipts")({
  head: () => ({
    meta: [
      {
        title: "Receipt Upload — WasteWise AI",
      },
    ],
  }),
  component: ReceiptsPage,
});

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function formatMoney(
  value: number | null,
  currency: string,
) {
  if (value === null) {
    return "—";
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function formatPackage(item: ReceiptItem) {
  if (
    item.package_size === null ||
    item.package_unit === "unknown"
  ) {
    return "No package size";
  }

  const labels: Record<string, string> = {
    fl_oz: "fl oz",
    l: "L",
  };

  const unit = labels[item.package_unit]
    ?? item.package_unit;

  return `${item.package_size} ${unit}`;
}

function formatPurchasedQuantity(item: ReceiptItem) {
  const quantity = item.purchased_quantity ?? 1;

  if (
    item.package_size === null &&
    [
      "g",
      "kg",
      "ml",
      "l",
      "oz",
      "fl_oz",
      "lb",
      "gal",
      "pint",
      "quart",
    ].includes(item.package_unit)
  ) {
    const unit = item.package_unit === "fl_oz"
      ? "fl oz"
      : item.package_unit;

    return `${quantity} ${unit}`;
  }

  return `${quantity}`;
}

function formatChangeQuantity(
  change: PantryReceiptChange,
) {
  if (change.quantity_added === null) {
    return "—";
  }

  return `${change.quantity_added} ${change.unit ?? ""}`.trim();
}

function ReceiptsPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<ReceiptProcessResponse | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const mutation = useMutation({
    mutationFn: async (selectedFile: File) =>
      uploadReceipt(
        selectedFile,
        setUploadProgress,
      ),
    onSuccess: async (data) => {
      setResult(data);

      toast.success(
        `${data.summary.items_created} new pantry batch${
          data.summary.items_created === 1 ? "" : "es"
        } added.`,
      );

      await queryClient.invalidateQueries({
        queryKey: ["pantry"],
      });
    },
    onError: (error) => {
      toast.error(extractApiError(error));
    },
  });

  const isProcessing = mutation.isPending;

  const clearSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setUploadProgress(0);
    mutation.reset();

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const selectFile = (selectedFile: File) => {
    if (!ALLOWED_FILE_TYPES.has(selectedFile.type)) {
      toast.error(
        "Upload a JPG, JPEG, PNG, or WEBP receipt image.",
      );
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      toast.error(
        "Receipt image must be 10 MB or smaller.",
      );
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setFile(selectedFile);
    setPreviewUrl(
      URL.createObjectURL(selectedFile),
    );
    setResult(null);
    setUploadProgress(0);
    mutation.reset();
  };

  const handleInputChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      selectFile(selectedFile);
    }
  };

  const handleDrop = (
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    setDragActive(false);

    if (isProcessing) {
      return;
    }

    const selectedFile = event.dataTransfer.files?.[0];

    if (selectedFile) {
      selectFile(selectedFile);
    }
  };

  const handleProcess = () => {
    if (!file) {
      toast.error("Choose a receipt image first.");
      return;
    }

    setResult(null);
    setUploadProgress(0);
    mutation.mutate(file);
  };

  return (
    <RequireAuth>
      <AppShell title="Receipt Upload">
        <div className="mx-auto max-w-6xl space-y-6">
          <section className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
            <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
              <div className="p-5 sm:p-7 lg:p-8">
                <div className="mb-6 max-w-2xl">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <ReceiptText className="h-3.5 w-3.5" />
                    Smart receipt processing
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    Turn a receipt into accurate pantry batches
                  </h2>

                  <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                    WasteWise extracts generic pantry names, quantities,
                    package information, prices, tax, and purchase dates.
                    Every purchase is stored as its own batch, so its expiry
                    date remains accurate.
                  </p>
                </div>

                <input
                  ref={inputRef}
                  id="receipt-file"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.jfif,.png,.webp"
                  onChange={handleInputChange}
                  className="hidden"
                  disabled={isProcessing}
                />

                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (!isProcessing) {
                      setDragActive(true);
                    }
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    setDragActive(false);
                  }}
                  onDrop={handleDrop}
                  className={cn(
                    "relative rounded-2xl border-2 border-dashed p-6 text-center transition sm:p-9",
                    dragActive
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background/50 hover:border-primary/50 hover:bg-primary/5",
                    isProcessing && "pointer-events-none opacity-70",
                  )}
                >
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <UploadCloud className="h-7 w-7" />
                  </div>

                  <p className="mt-4 font-semibold">
                    Drag and drop your receipt here
                  </p>

                  <p className="mt-1 text-sm text-muted-foreground">
                    JPG, PNG or WEBP, up to 10 MB
                  </p>

                  <Button
                    type="button"
                    variant="outline"
                    className="mt-5"
                    onClick={() => inputRef.current?.click()}
                    disabled={isProcessing}
                  >
                    <FileImage className="mr-2 h-4 w-4" />
                    Choose image
                  </Button>
                </div>

                {file && (
                  <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-background/50 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={clearSelection}
                      disabled={isProcessing}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                <Button
                  type="button"
                  className="mt-5 w-full bg-gradient-pink text-white shadow-glow"
                  onClick={handleProcess}
                  disabled={!file || isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Reading receipt and creating batches…
                    </>
                  ) : (
                    <>
                      <PackageCheck className="mr-2 h-4 w-4" />
                      Scan and add to pantry
                    </>
                  )}
                </Button>

                {isProcessing && (
                  <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-primary">
                        Processing receipt
                      </span>
                      <span className="text-muted-foreground">
                        {uploadProgress < 100
                          ? `${uploadProgress}% uploaded`
                          : "AI analysis in progress"}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        animate={{
                          width: uploadProgress < 100
                            ? `${uploadProgress}%`
                            : "100%",
                        }}
                      />
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      AI extraction can take up to a couple of minutes for
                      detailed receipts. Keep this page open.
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-border/60 bg-background/40 p-5 sm:p-7 lg:border-l lg:border-t-0 lg:p-8">
                {previewUrl ? (
                  <div className="overflow-hidden rounded-2xl border border-border bg-black/10">
                    <img
                      src={previewUrl}
                      alt="Receipt preview"
                      className="max-h-[560px] w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center">
                    <div>
                      <FileImage className="mx-auto h-10 w-10 text-muted-foreground" />
                      <p className="mt-3 font-medium">
                        Receipt preview
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Your selected receipt image will appear here.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {result && (
            <section className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  icon={Store}
                  label="Merchant"
                  value={result.receipt.merchant_name ?? "Unknown merchant"}
                />
                <SummaryCard
                  icon={CalendarDays}
                  label="Purchase date"
                  value={formatDate(result.receipt.purchase_date)}
                  note={result.receipt.purchase_date_source === "upload_date"
                    ? "Upload date used"
                    : "Read from receipt"}
                />
                <SummaryCard
                  icon={WalletCards}
                  label="Receipt total"
                  value={formatMoney(
                    result.receipt.total_amount,
                    result.receipt.currency,
                  )}
                />
                <SummaryCard
                  icon={PackageCheck}
                  label="New batches"
                  value={`${result.summary.items_created}`}
                  note={`${result.summary.items_skipped} skipped`}
                />
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        Extracted products
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Generic pantry names are shown first; the branded
                        receipt name remains available underneath.
                      </p>
                    </div>
                    <ReceiptText className="h-5 w-5 text-primary" />
                  </div>

                  <div className="mt-4 space-y-3">
                    {result.receipt.items.map((item, index) => (
                      <div
                        key={`${item.raw_name}-${index}`}
                        className="rounded-2xl border border-border/70 bg-background/40 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {item.pantry_name ?? item.product_name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Receipt: {item.product_name}
                            </p>
                          </div>
                          <p className="font-medium tabular-nums">
                            {formatMoney(
                              item.line_total,
                              result.receipt.currency,
                            )}
                          </p>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="rounded-full bg-muted px-2.5 py-1">
                            Qty {formatPurchasedQuantity(item)}
                          </span>
                          <span className="rounded-full bg-muted px-2.5 py-1">
                            {formatPackage(item)}
                          </span>
                          <span className="rounded-full bg-muted px-2.5 py-1 capitalize">
                            {item.category}
                          </span>
                          <span className="rounded-full bg-muted px-2.5 py-1 capitalize">
                            {item.location}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-5">
                  <FinancialCard result={result} />

                  <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">
                          Pantry batches created
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Each entry keeps its own purchase and expiry date.
                        </p>
                      </div>
                      <PackageCheck className="h-5 w-5 text-primary" />
                    </div>

                    <div className="mt-4 space-y-3">
                      {result.pantry_changes.map((change, index) => (
                        <div
                          key={`${change.pantry_item_id ?? change.product_name}-${index}`}
                          className="rounded-2xl border border-border/70 bg-background/40 p-4"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium">
                                {change.product_name}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatChangeQuantity(change)} · Expires {formatDate(change.expiry_date)}
                              </p>
                            </div>
                            <span className={cn(
                              "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              change.action === "created"
                                ? "bg-emerald-500/10 text-emerald-500"
                                : change.action === "skipped"
                                  ? "bg-amber-500/10 text-amber-500"
                                  : "bg-primary/10 text-primary",
                            )}>
                              {change.action === "created"
                                ? "New batch"
                                : change.action}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      <Button asChild className="bg-gradient-pink text-white">
                        <Link to="/pantry">
                          Open Smart Pantry
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={clearSelection}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Scan another receipt
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Store;
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {label}
      </div>
      <p className="mt-3 truncate text-lg font-semibold">
        {value}
      </p>
      {note && (
        <p className="mt-1 text-xs text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

function FinancialCard({
  result,
}: {
  result: ReceiptProcessResponse;
}) {
  const validation = result.financial_validation;
  const reconciled = validation.status === "reconciled";
  const unavailable = validation.status === "unavailable";

  return (
    <div className="rounded-3xl border border-border bg-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">
            Financial check
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Product lines, tax, charges and receipt total.
          </p>
        </div>
        {reconciled ? (
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        ) : (
          <AlertTriangle className={cn(
            "h-6 w-6",
            unavailable
              ? "text-muted-foreground"
              : "text-amber-500",
          )} />
        )}
      </div>

      <div className="mt-5 space-y-3 text-sm">
        <MoneyRow
          label="Items subtotal"
          value={formatMoney(
            validation.items_subtotal,
            result.receipt.currency,
          )}
        />
        <MoneyRow
          label="Tax"
          value={formatMoney(
            result.receipt.tax_amount,
            result.receipt.currency,
          )}
        />
        <MoneyRow
          label="Calculated total"
          value={formatMoney(
            validation.calculated_total,
            result.receipt.currency,
          )}
        />
        <MoneyRow
          label="Receipt total"
          value={formatMoney(
            validation.receipt_total,
            result.receipt.currency,
          )}
          strong
        />
      </div>

      <div className={cn(
        "mt-5 rounded-xl border p-3 text-xs leading-5",
        reconciled
          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-500"
          : unavailable
            ? "border-border bg-muted/40 text-muted-foreground"
            : "border-amber-500/20 bg-amber-500/5 text-amber-500",
      )}>
        {validation.notes[0]
          ?? "No financial validation note was returned."}
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">
        {label}
      </span>
      <span className={cn(
        "tabular-nums",
        strong && "font-semibold text-foreground",
      )}>
        {value}
      </span>
    </div>
  );
}