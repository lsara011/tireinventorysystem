"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { History, PackageMinus, Pencil, Plus, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type InventoryRemovalReason,
  RemoveTireStockDialog,
  TireEditorDialog,
  TireHistoryDialog,
} from "./TireDialogs";

export type Tire = {
  id: number;
  tire_brand: string;
  tire_quantity: number;
  tire_size: string;
  tire_price: number;
  tire_location: string;
};

type TireInventoryProps = {
  tires: Tire[];
  initiallyAdding?: boolean;
};

export function TireInventory({
  tires,
  initiallyAdding = false,
}: TireInventoryProps) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [inventoryTires, setInventoryTires] = React.useState(tires);
  const [editor, setEditor] = React.useState<Tire | "new" | null>(
    initiallyAdding ? "new" : null,
  );
  const [removalTarget, setRemovalTarget] = React.useState<Tire | null>(null);
  const [removing, setRemoving] = React.useState(false);
  const [removalError, setRemovalError] = React.useState("");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const normalizedQuery = query.trim().toLowerCase();

  const filteredTires = inventoryTires.filter((tire) =>
    [
      tire.tire_brand,
      tire.tire_size,
      tire.tire_location,
      tire.tire_price,
      tire.tire_quantity,
    ].some((value) => String(value).toLowerCase().includes(normalizedQuery)),
  );

  function closeEditor() {
    setEditor(null);
    if (initiallyAdding) router.replace("/", { scroll: false });
  }

  function handleSaved(savedTire: Tire) {
    setInventoryTires((current) => {
      const exists = current.some((tire) => tire.id === savedTire.id);
      return exists
        ? current.map((tire) => (tire.id === savedTire.id ? savedTire : tire))
        : [savedTire, ...current];
    });
    closeEditor();
    router.refresh();
  }

  async function handleRemoval(
    quantity: number,
    reason: InventoryRemovalReason,
    unitCost: number,
    unitRevenue: number,
    note: string,
  ) {
    if (!removalTarget) return;

    setRemoving(true);
    setRemovalError("");

    try {
      const response = await fetch(
        `/api/tires/${removalTarget.id}/remove-stock`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity,
            reason,
            unit_cost: unitCost,
            unit_revenue: unitRevenue,
            note,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        detail?: string;
        quantity_after?: number;
      } | null;

      if (!response.ok) {
        throw new Error(body?.detail ?? "Unable to remove tire stock.");
      }

      if (typeof body?.quantity_after !== "number") {
        throw new Error("The inventory service returned an invalid response.");
      }

      const targetId = removalTarget.id;
      const quantityAfter = body.quantity_after;

      setInventoryTires((current) =>
        quantityAfter === 0
          ? current.filter((tire) => tire.id !== targetId)
          : current.map((tire) =>
              tire.id === targetId
                ? { ...tire, tire_quantity: quantityAfter }
                : tire,
            ),
      );
      setRemovalTarget(null);
      router.refresh();
    } catch (error) {
      setRemovalError(
        error instanceof Error
          ? error.message
          : "Unable to remove tire stock.",
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Available Tires</h1>
          <Button className="md:hidden" onClick={() => setEditor("new")}>
            <Plus className="size-4" aria-hidden="true" />
            Add tire
          </Button>
        </div>

        <div className="flex w-full items-center gap-2 sm:max-w-md">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search tires"
              aria-label="Search tires"
              className="h-10 w-full rounded-md border border-zinc-300 bg-white pl-9 pr-10 text-sm outline-none transition-shadow placeholder:text-zinc-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear tire search"
                title="Clear search"
                className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setHistoryOpen(true)}
            aria-label="View inventory history"
            title="Inventory history"
          >
            <History className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {inventoryTires.length === 0 ? (
        <p className="text-zinc-600">No tires available.</p>
      ) : filteredTires.length === 0 ? (
        <div className="rounded-md border border-zinc-200 bg-white px-4 py-10 text-center">
          <p className="font-medium text-zinc-900">No matching tires</p>
          <p className="mt-1 text-sm text-zinc-600">
            Try a different brand, size, or location.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          {filteredTires.map((tire) => (
            <div
              key={tire.id}
              className="grid grid-cols-2 items-center gap-4 border-b border-zinc-200 p-4 last:border-0 sm:grid-cols-[2fr_1fr_1fr_1.5fr_1fr_auto]"
            >
              <span className="min-w-0 truncate font-medium">
                {tire.tire_brand}
              </span>
              <span className="text-sm text-zinc-600">{tire.tire_size}</span>
              <span className="text-sm text-zinc-600">
                ${tire.tire_price}
              </span>
              <span className="text-sm text-zinc-600">
                {tire.tire_quantity} available
              </span>
              <span className="text-sm text-zinc-600">
                {tire.tire_location}
              </span>
              <div className="flex justify-self-end gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setEditor(tire)}
                  aria-label={`Edit ${tire.tire_brand} ${tire.tire_size}`}
                  title="Edit tire"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => {
                    setRemovalError("");
                    setRemovalTarget(tire);
                  }}
                  aria-label={`Remove stock for ${tire.tire_brand} ${tire.tire_size}`}
                  title="Remove stock"
                >
                  <PackageMinus className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {normalizedQuery && filteredTires.length > 0 && (
        <p className="mt-3 text-sm text-zinc-500" aria-live="polite">
          {filteredTires.length} {filteredTires.length === 1 ? "tire" : "tires"}
          {" found"}
        </p>
      )}

      {editor && (
        <TireEditorDialog
          key={editor === "new" ? "new" : editor.id}
          tire={editor === "new" ? undefined : editor}
          onClose={closeEditor}
          onSaved={handleSaved}
        />
      )}

      {removalTarget && (
        <RemoveTireStockDialog
          key={removalTarget.id}
          tire={removalTarget}
          removing={removing}
          error={removalError}
          onClose={() => {
            if (!removing) setRemovalTarget(null);
          }}
          onConfirm={handleRemoval}
        />
      )}

      {historyOpen && (
        <TireHistoryDialog onClose={() => setHistoryOpen(false)} />
      )}
    </>
  );
}
