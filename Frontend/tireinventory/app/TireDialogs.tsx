"use client";

import * as React from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Tire } from "./TireInventory";

const fieldClass =
  "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

const reasonLabels = {
  sold: "Sold",
  damaged: "Damaged",
  returned_to_supplier: "Returned to supplier",
  inventory_correction: "Inventory correction",
  other: "Other",
} as const;

export type InventoryRemovalReason = keyof typeof reasonLabels;

type DialogShellProps = {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
};

function DialogShell({
  title,
  description,
  onClose,
  children,
  wide = false,
}: DialogShellProps) {
  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[90dvh] w-full overflow-y-auto rounded-t-md bg-white shadow-xl sm:rounded-md ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id="dialog-title" className="text-lg font-semibold text-zinc-950">
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-sm text-zinc-600">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            title="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

type TireEditorDialogProps = {
  tire?: Tire;
  onClose: () => void;
  onSaved: (tire: Tire) => void;
};

export function TireEditorDialog({
  tire,
  onClose,
  onSaved,
}: TireEditorDialogProps) {
  const [values, setValues] = React.useState({
    tire_brand: tire?.tire_brand ?? "",
    tire_size: tire?.tire_size ?? "",
    tire_price: tire ? String(tire.tire_price) : "",
    tire_quantity: tire ? String(tire.tire_quantity) : "",
    tire_location: tire?.tire_location ?? "",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  function updateField(event: React.ChangeEvent<HTMLInputElement>) {
    setValues((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const response = await fetch(tire ? `/api/tires/${tire.id}` : "/api/tires", {
        method: tire ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tire_brand: values.tire_brand.trim(),
          tire_size: values.tire_size.trim(),
          tire_price: Number(values.tire_price),
          tire_quantity: Number(values.tire_quantity),
          tire_location: values.tire_location.trim(),
        }),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : `Unable to ${tire ? "update" : "add"} tire.`,
        );
      }

      onSaved(body as Tire);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save tire.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell
      title={tire ? "Edit tire" : "Add tire"}
      description={
        tire
          ? "Update this tire's inventory details."
          : "Enter the tire details to add it to inventory."
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
            Brand
            <input
              name="tire_brand"
              value={values.tire_brand}
              onChange={updateField}
              className={fieldClass}
              autoFocus
              required
              maxLength={100}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
            Size
            <input
              name="tire_size"
              value={values.tire_size}
              onChange={updateField}
              className={fieldClass}
              placeholder="205/55R16"
              required
              maxLength={50}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
            Price
            <input
              name="tire_price"
              type="number"
              value={values.tire_price}
              onChange={updateField}
              className={fieldClass}
              min="0"
              step="1"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
            Quantity
            <input
              name="tire_quantity"
              type="number"
              value={values.tire_quantity}
              onChange={updateField}
              className={fieldClass}
              min="0"
              step="1"
              required
            />
          </label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
          Location
          <input
            name="tire_location"
            value={values.tire_location}
            onChange={updateField}
            className={fieldClass}
            placeholder="Rack A1"
            required
            maxLength={100}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : tire ? "Save changes" : "Add tire"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

type RemoveTireStockDialogProps = {
  tire: Tire;
  removing: boolean;
  error: string;
  onClose: () => void;
  onConfirm: (
    quantity: number,
    reason: InventoryRemovalReason,
    unitCost: number,
    unitRevenue: number,
    note: string,
  ) => void;
};

export function RemoveTireStockDialog({
  tire,
  removing,
  error,
  onClose,
  onConfirm,
}: RemoveTireStockDialogProps) {
  const [quantity, setQuantity] = React.useState("1");
  const [reason, setReason] =
    React.useState<InventoryRemovalReason>("sold");
  const [unitCost, setUnitCost] = React.useState(String(tire.tire_price));
  const [unitRevenue, setUnitRevenue] = React.useState("");
  const [note, setNote] = React.useState("");
  const noteRequired = reason === "other";
  const selectedQuantity = Number(quantity);
  const selectedCost = Number(unitCost);
  const selectedRevenue = Number(unitRevenue);
  const removesAll = selectedQuantity === tire.tire_quantity;
  const totalCost = selectedQuantity * selectedCost;
  const totalRevenue = selectedQuantity * selectedRevenue;
  const net = totalRevenue - totalCost;
  const revenueLabel =
    reason === "sold"
      ? "Sale price per tire"
      : reason === "returned_to_supplier"
        ? "Supplier credit per tire"
        : "Amount recovered per tire";

  return (
    <DialogShell
      title="Remove tire stock"
      description={`${tire.tire_brand} ${tire.tire_size} has ${tire.tire_quantity} available.`}
      onClose={onClose}
    >
      <form
        className="space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(
            selectedQuantity,
            reason,
            selectedCost,
            selectedRevenue,
            note,
          );
        }}
      >
        <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
          Quantity to remove
          <input
            type="number"
            value={quantity}
            onChange={(event) => {
              const nextValue = event.target.value;

              if (nextValue === "") {
                setQuantity("");
                return;
              }

              const nextQuantity = Math.trunc(Number(nextValue));
              if (!Number.isFinite(nextQuantity)) return;

              setQuantity(
                String(Math.min(tire.tire_quantity, Math.max(1, nextQuantity))),
              );
            }}
            className={fieldClass}
            min="1"
            max={tire.tire_quantity}
            step="1"
            autoFocus
            required
          />
          <span className="text-xs font-normal text-zinc-500">
            Maximum: {tire.tire_quantity}
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
          Reason
          <select
            value={reason}
            onChange={(event) => {
              const nextReason = event.target.value as InventoryRemovalReason;
              setReason(nextReason);
              if (nextReason === "sold" && unitRevenue === "0") {
                setUnitRevenue("");
              } else if (nextReason !== "sold" && unitRevenue === "") {
                setUnitRevenue("0");
              }
            }}
            className={fieldClass}
          >
            {Object.entries(reasonLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
            Cost per tire
            <input
              type="number"
              value={unitCost}
              onChange={(event) => setUnitCost(event.target.value)}
              className={fieldClass}
              min="0"
              step="1"
              required
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
            {revenueLabel}
            <input
              type="number"
              value={unitRevenue}
              onChange={(event) => setUnitRevenue(event.target.value)}
              className={fieldClass}
              min="0"
              step="1"
              required
              placeholder="0"
            />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-3 border-y border-zinc-200 py-3 text-sm">
          <div>
            <p className="text-xs text-zinc-500">Cost</p>
            <p className="font-medium text-zinc-900">${Number.isFinite(totalCost) ? totalCost : 0}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Received</p>
            <p className="font-medium text-zinc-900">${Number.isFinite(totalRevenue) ? totalRevenue : 0}</p>
          </div>
          <div>
            <p className="text-xs text-zinc-500">Net</p>
            <p className={`font-medium ${net < 0 ? "text-red-700" : "text-emerald-700"}`}>
              {net < 0 ? "-" : "+"}${Number.isFinite(net) ? Math.abs(net) : 0}
            </p>
          </div>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
          Note {noteRequired ? "(required)" : "(optional)"}
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-24 w-full resize-y rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            maxLength={500}
            required={noteRequired}
            placeholder="Add context for the inventory history"
          />
        </label>

        <p className="text-sm text-zinc-600">
          {removesAll
            ? "All available tires will be removed from active inventory."
            : `${tire.tire_quantity - selectedQuantity} will remain in inventory.`}{" "}
          The quantity change and reason will be saved in history.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={removing}>
            {removing ? "Recording..." : "Confirm removal"}
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

type TireHistoryEntry = {
  id: number;
  tire_id: number;
  tire_snapshot: Tire;
  reason: InventoryRemovalReason;
  note: string | null;
  quantity_removed: number | null;
  quantity_before: number | null;
  quantity_after: number | null;
  unit_cost?: number | null;
  unit_revenue?: number | null;
  created_at: string;
};

export function TireHistoryDialog({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = React.useState<TireHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const soldCount = entries
    .filter((entry) => entry.reason === "sold")
    .reduce((total, entry) => total + (entry.quantity_removed ?? 0), 0);

  React.useEffect(() => {
    let active = true;

    fetch("/api/tires/history", { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof body?.detail === "string"
              ? body.detail
              : "Unable to load history.",
          );
        }
        if (active) setEntries(body as TireHistoryEntry[]);
      })
      .catch((caughtError: unknown) => {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load history.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <DialogShell
      title="Inventory history"
      description={`${soldCount} ${soldCount === 1 ? "tire" : "tires"} recorded as sold.`}
      onClose={onClose}
      wide
    >
      <div className="p-5">
        {loading ? (
          <p className="text-sm text-zinc-600">Loading history...</p>
        ) : error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No tire removals have been recorded.
          </p>
        ) : (
          <div className="divide-y divide-zinc-200 border-y border-zinc-200">
            {entries.map((entry) => (
              <div key={entry.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-zinc-950">
                      {entry.tire_snapshot.tire_brand}{" "}
                      {entry.tire_snapshot.tire_size}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      {entry.quantity_removed ??
                        entry.tire_snapshot.tire_quantity}{" "}
                      removed |{" "}
                      {entry.quantity_before ??
                        entry.tire_snapshot.tire_quantity}{" "}
                      before | {entry.quantity_after ?? 0} after
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">
                      ${entry.tire_snapshot.tire_price} |{" "}
                      {entry.tire_snapshot.tire_location}
                    </p>
                    {entry.unit_cost != null && entry.unit_revenue != null && (
                      <p className="mt-1 text-sm text-zinc-600">
                        Cost ${entry.unit_cost * (entry.quantity_removed ?? 0)} |{" "}
                        Received ${entry.unit_revenue * (entry.quantity_removed ?? 0)} |{" "}
                        Net ${
                          (entry.unit_revenue - entry.unit_cost) *
                          (entry.quantity_removed ?? 0)
                        }
                      </p>
                    )}
                  </div>
                  <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                    {reasonLabels[entry.reason] ?? entry.reason}
                  </span>
                </div>
                {entry.note && (
                  <p className="mt-2 text-sm text-zinc-700">{entry.note}</p>
                )}
                <p className="mt-2 text-xs text-zinc-500">
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(entry.created_at))}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DialogShell>
  );
}
