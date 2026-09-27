"use client";

import * as React from "react";
import { ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type SupplierOption = {
  id: number;
  name: string;
  is_active: boolean;
};

type OrderItem = {
  id?: number;
  tire_brand: string;
  tire_size: string;
  quantity: number;
  unit_price: number;
};

export type PurchaseOrder = {
  id: number;
  supplier_id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  invoice_path: string | null;
  invoice_name: string | null;
  notes: string | null;
  created_at: string;
  supplier: { id: number; name: string };
  items: OrderItem[];
};

type EditableItem = {
  key: string;
  tire_brand: string;
  tire_size: string;
  quantity: string;
  unit_price: string;
};

const inputClass =
  "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

const statusLabels: Record<PurchaseOrder["status"], string> = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partially received",
  received: "Received",
  cancelled: "Cancelled",
};

function emptyItem(key = crypto.randomUUID()): EditableItem {
  return {
    key,
    tire_brand: "",
    tire_size: "",
    quantity: "1",
    unit_price: "0",
  };
}

export function OrdersManager({
  orders,
  suppliers,
}: {
  orders: PurchaseOrder[];
  suppliers: SupplierOption[];
}) {
  const [items, setItems] = React.useState(orders);
  const [adding, setAdding] = React.useState(false);
  const [editingOrder, setEditingOrder] = React.useState<PurchaseOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<PurchaseOrder | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [deleteError, setDeleteError] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [lineItems, setLineItems] = React.useState<EditableItem[]>([
    emptyItem("initial"),
  ]);
  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active);
  const filtered = status === "all" ? items : items.filter((order) => order.status === status);

  function closeForm() {
    setAdding(false);
    setEditingOrder(null);
    setError("");
    setLineItems([emptyItem()]);
  }

  function openEditor(order: PurchaseOrder) {
    setEditingOrder(order);
    setError("");
    setLineItems(
      order.items.length > 0
        ? order.items.map((item, index) => ({
            key: item.id ? `item-${item.id}` : `item-${index}`,
            tire_brand: item.tire_brand,
            tire_size: item.tire_size,
            quantity: String(item.quantity),
            unit_price: String(item.unit_price),
          }))
        : [emptyItem()],
    );
  }

  function updateLineItem(key: string, field: keyof EditableItem, value: string) {
    setLineItems((current) =>
      current.map((item) => (item.key === key ? { ...item, [field]: value } : item)),
    );
  }

  async function saveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const source = new FormData(event.currentTarget);
    const metadata = {
      supplier_id: Number(source.get("supplier_id")),
      invoice_number: String(source.get("invoice_number") ?? "").trim(),
      invoice_date: String(source.get("invoice_date") ?? ""),
      total_amount: Number(source.get("total_amount")),
      status: String(source.get("status") ?? "draft"),
      notes: String(source.get("notes") ?? "").trim() || null,
      items: lineItems
        .filter((item) => item.tire_brand.trim() && item.tire_size.trim())
        .map((item) => ({
          tire_brand: item.tire_brand.trim(),
          tire_size: item.tire_size.trim(),
          quantity: Number(item.quantity),
          unit_price: Number(item.unit_price),
        })),
    };
    const requestBody = new FormData();
    requestBody.append("metadata", JSON.stringify(metadata));
    const invoice = source.get("invoice");
    if (invoice instanceof File && invoice.size > 0) requestBody.append("invoice", invoice);
    if (source.get("remove_invoice") === "true") {
      requestBody.append("remove_invoice", "true");
    }

    try {
      const endpoint = editingOrder ? `/api/orders/${editingOrder.id}` : "/api/orders";
      const response = await fetch(endpoint, {
        method: editingOrder ? "PUT" : "POST",
        body: requestBody,
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof body?.detail === "string" ? body.detail : "Unable to save order.",
        );
      }

      setItems((current) =>
        editingOrder
          ? current.map((order) =>
              order.id === editingOrder.id ? (body as PurchaseOrder) : order,
            )
          : [body as PurchaseOrder, ...current],
      );
      closeForm();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to save order.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrder() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/orders/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.detail === "string" ? body.detail : "Unable to delete order.",
        );
      }

      setItems((current) => current.filter((order) => order.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (caughtError) {
      setDeleteError(
        caughtError instanceof Error ? caughtError.message : "Unable to delete order.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Orders</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Supplier purchases and invoice records
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter order status"
            className={inputClass}
          >
            <option value="all">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <Button onClick={() => setAdding(true)} disabled={activeSuppliers.length === 0}>
            <Plus className="size-4" aria-hidden="true" />
            Add order
          </Button>
        </div>
      </div>

      {activeSuppliers.length === 0 && (
        <p className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Add an active supplier before creating an order.
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="border-y border-zinc-200 py-12 text-center text-sm text-zinc-600">
          {items.length === 0 ? "No orders yet." : "No orders match this status."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="hidden grid-cols-[1.2fr_1.5fr_1fr_1fr_1fr_auto_auto] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase text-zinc-500 md:grid">
            <span>Invoice</span><span>Supplier</span><span>Date</span><span>Status</span><span>Total</span><span>File</span><span>Actions</span>
          </div>
          {filtered.map((order) => (
            <div
              key={order.id}
              className="grid gap-3 border-b border-zinc-200 p-4 last:border-0 md:grid-cols-[1.2fr_1.5fr_1fr_1fr_1fr_auto_auto] md:items-center md:gap-4"
            >
              <div>
                <p className="font-medium text-zinc-950">{order.invoice_number}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {order.items.length} {order.items.length === 1 ? "line item" : "line items"}
                </p>
              </div>
              <p className="text-sm text-zinc-700">{order.supplier.name}</p>
              <p className="text-sm text-zinc-600">
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${order.invoice_date}T00:00:00`))}
              </p>
              <span className="w-fit rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                {statusLabels[order.status]}
              </span>
              <p className="text-sm font-medium text-zinc-800">${order.total_amount}</p>
              {order.invoice_path ? (
                <a
                  href={`/api/orders/${order.id}/invoice`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                  aria-label={`Open invoice ${order.invoice_number}`}
                  title="Open invoice"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-xs text-zinc-400">None</span>
              )}
              <div className="mt-1 flex gap-3 md:mt-0 md:gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-11 md:size-9"
                  onClick={() => openEditor(order)}
                  aria-label={`Edit invoice ${order.invoice_number}`}
                  title="Edit order"
                >
                  <Pencil className="size-5 md:size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="size-11 md:size-9"
                  onClick={() => {
                    setDeleteError("");
                    setDeleteTarget(order);
                  }}
                  aria-label={`Delete invoice ${order.invoice_number}`}
                  title="Delete order"
                >
                  <Trash2 className="size-5 md:size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(adding || editingOrder) && (
        <Modal
          title={editingOrder ? "Edit purchase order" : "Add purchase order"}
          description={
            editingOrder
              ? "Correct order details, line items, or the attached invoice."
              : "Record an order and attach its supplier invoice."
          }
          onClose={closeForm}
          wide
        >
          <form
            key={editingOrder?.id ?? "new"}
            onSubmit={saveOrder}
            className="space-y-5 p-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                Supplier
                <select
                  name="supplier_id"
                  className={inputClass}
                  defaultValue={editingOrder?.supplier_id}
                  required
                  autoFocus
                >
                  {suppliers
                    .filter(
                      (supplier) =>
                        supplier.is_active || supplier.id === editingOrder?.supplier_id,
                    )
                    .map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </label>
              <Field label="Invoice number" name="invoice_number" defaultValue={editingOrder?.invoice_number} required />
              <Field label="Invoice date" name="invoice_date" type="date" defaultValue={editingOrder?.invoice_date ?? new Date().toISOString().slice(0, 10)} required />
              <Field label="Total amount" name="total_amount" type="number" min="0" step="1" defaultValue={editingOrder?.total_amount} required />
              <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                Status
                <select name="status" className={inputClass} defaultValue={editingOrder?.status ?? "draft"}>
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                Invoice file
                <input name="invoice" type="file" accept="application/pdf,image/png,image/jpeg" className="h-10 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium" />
              </label>
              {editingOrder?.invoice_path && (
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-zinc-700">
                  <input
                    name="remove_invoice"
                    value="true"
                    type="checkbox"
                    className="size-4 accent-red-600"
                  />
                  Remove current invoice file
                </label>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">Tire line items</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setLineItems((current) => [...current, emptyItem()])}>
                  <Plus className="size-4" aria-hidden="true" /> Add line
                </Button>
              </div>
              <div className="space-y-2">
                {lineItems.map((item) => (
                  <div key={item.key} className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 p-3 sm:grid-cols-[1.4fr_1fr_.7fr_.8fr_auto]">
                    <LineInput label="Brand" value={item.tire_brand} onChange={(value) => updateLineItem(item.key, "tire_brand", value)} />
                    <LineInput label="Size" value={item.tire_size} onChange={(value) => updateLineItem(item.key, "tire_size", value)} />
                    <LineInput label="Qty" type="number" min="1" step="1" value={item.quantity} onChange={(value) => updateLineItem(item.key, "quantity", value)} />
                    <LineInput label="Unit price" type="number" min="0" step="1" value={item.unit_price} onChange={(value) => updateLineItem(item.key, "unit_price", value)} />
                    <Button type="button" variant="outline" size="icon" className="self-end" disabled={lineItems.length === 1} onClick={() => setLineItems((current) => current.filter((line) => line.key !== item.key))} aria-label="Remove line item" title="Remove line">
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
              Notes
              <textarea name="notes" defaultValue={editingOrder?.notes ?? ""} maxLength={1000} className="min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20" />
            </label>
            <p className="flex items-center gap-2 text-xs text-zinc-500">
              <FileText className="size-4" aria-hidden="true" /> PDF, PNG, or JPEG, up to 10 MB.
            </p>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingOrder ? "Save changes" : "Add order"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete order?"
          description={`Invoice ${deleteTarget.invoice_number} will be permanently deleted.`}
          onClose={() => !deleting && setDeleteTarget(null)}
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-zinc-700">
              This removes the order, its line items, and its uploaded invoice file.
            </p>
            {deleteError && <p role="alert" className="text-sm text-red-700">{deleteError}</p>}
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={deleteOrder}>
                {deleting ? "Deleting..." : "Delete order"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

type FieldProps = React.ComponentProps<"input"> & { label: string };

function Field({ label, ...props }: FieldProps) {
  return <label className="grid gap-1.5 text-sm font-medium text-zinc-800">{label}<input {...props} className={inputClass} /></label>;
}

function LineInput({ label, onChange, ...props }: Omit<React.ComponentProps<"input">, "onChange"> & { label: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-medium text-zinc-600">
      {label}
      <input {...props} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}
