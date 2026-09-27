"use client";

import * as React from "react";
import { ExternalLink, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export type Supplier = {
  id: number;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  account_number: string | null;
  payment_terms: string | null;
  brands: string[];
  lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
};

const inputClass =
  "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

export function SupplierManager({ suppliers }: { suppliers: Supplier[] }) {
  const [items, setItems] = React.useState(suppliers);
  const [query, setQuery] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [editingSupplier, setEditingSupplier] = React.useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Supplier | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState("");
  const [deleteError, setDeleteError] = React.useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = items.filter((supplier) =>
    [
      supplier.name,
      supplier.contact_name,
      supplier.phone,
      supplier.email,
      supplier.website,
      supplier.account_number,
      ...supplier.brands,
    ].some((value) => value?.toLowerCase().includes(normalizedQuery)),
  );

  function closeForm() {
    setAdding(false);
    setEditingSupplier(null);
    setError("");
  }

  async function saveSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const leadTime = String(form.get("lead_time_days") ?? "").trim();
    const payload = {
      name: String(form.get("name") ?? "").trim(),
      contact_name: String(form.get("contact_name") ?? "").trim() || null,
      phone: String(form.get("phone") ?? "").trim() || null,
      email: String(form.get("email") ?? "").trim() || null,
      website: String(form.get("website") ?? "").trim() || null,
      address: String(form.get("address") ?? "").trim() || null,
      account_number: String(form.get("account_number") ?? "").trim() || null,
      payment_terms: String(form.get("payment_terms") ?? "").trim() || null,
      brands: String(form.get("brands") ?? "")
        .split(",")
        .map((brand) => brand.trim())
        .filter(Boolean),
      lead_time_days: leadTime ? Number(leadTime) : null,
      notes: String(form.get("notes") ?? "").trim() || null,
      is_active: form.get("is_active") === "true",
    };

    try {
      const endpoint = editingSupplier
        ? `/api/suppliers/${editingSupplier.id}`
        : "/api/suppliers";
      const response = await fetch(endpoint, {
        method: editingSupplier ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "Unable to save supplier.",
        );
      }

      setItems((current) => {
        const next = editingSupplier
          ? current.map((supplier) =>
              supplier.id === editingSupplier.id ? (body as Supplier) : supplier,
            )
          : [...current, body as Supplier];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      closeForm();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to save supplier.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSupplier() {
    if (!deleteTarget) return;

    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch(`/api/suppliers/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "Unable to delete supplier.",
        );
      }

      setItems((current) =>
        current.filter((supplier) => supplier.id !== deleteTarget.id),
      );
      setDeleteTarget(null);
    } catch (caughtError) {
      setDeleteError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to delete supplier.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Suppliers</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {items.length} {items.length === 1 ? "supplier" : "suppliers"}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:max-w-md">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search suppliers"
              aria-label="Search suppliers"
              className={`${inputClass} pl-9`}
            />
          </div>
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Add
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border-y border-zinc-200 py-12 text-center text-sm text-zinc-600">
          {items.length === 0 ? "No suppliers yet." : "No matching suppliers."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <div className="hidden grid-cols-[1.6fr_1.4fr_1.2fr_1fr_auto_auto] gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase text-zinc-500 md:grid">
            <span>Supplier</span>
            <span>Contact</span>
            <span>Brands</span>
            <span>Terms</span>
            <span>Website</span>
            <span>Actions</span>
          </div>
          {filtered.map((supplier) => (
            <div
              key={supplier.id}
              className="grid gap-3 border-b border-zinc-200 p-4 last:border-0 md:grid-cols-[1.6fr_1.4fr_1.2fr_1fr_auto_auto] md:items-center md:gap-4"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-zinc-950">{supplier.name}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {supplier.account_number
                    ? `Account ${supplier.account_number}`
                    : supplier.is_active
                      ? "Active"
                      : "Inactive"}
                </p>
              </div>
              <div className="space-y-1 text-sm text-zinc-600">
                {supplier.contact_name && <p>{supplier.contact_name}</p>}
                {supplier.phone && (
                  <a className="flex items-center gap-1.5 hover:text-zinc-950" href={`tel:${supplier.phone}`}>
                    <Phone className="size-3.5" aria-hidden="true" />
                    {supplier.phone}
                  </a>
                )}
                {supplier.email && (
                  <a className="flex items-center gap-1.5 hover:text-zinc-950" href={`mailto:${supplier.email}`}>
                    <Mail className="size-3.5" aria-hidden="true" />
                    {supplier.email}
                  </a>
                )}
              </div>
              <p className="text-sm text-zinc-600">
                {supplier.brands.length ? supplier.brands.join(", ") : "Not specified"}
              </p>
              <div className="text-sm text-zinc-600">
                <p>{supplier.payment_terms || "Not specified"}</p>
                {supplier.lead_time_days !== null && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {supplier.lead_time_days} day lead time
                  </p>
                )}
              </div>
              {supplier.website ? (
                <a
                  href={supplier.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex size-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                  aria-label={`Open ${supplier.name} website`}
                  title="Open website"
                >
                  <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              ) : (
                <span className="text-xs text-zinc-400">None</span>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setError("");
                    setEditingSupplier(supplier);
                  }}
                  aria-label={`Edit ${supplier.name}`}
                  title="Edit supplier"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => {
                    setDeleteError("");
                    setDeleteTarget(supplier);
                  }}
                  aria-label={`Delete ${supplier.name}`}
                  title="Delete supplier"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(adding || editingSupplier) && (
        <Modal
          title={editingSupplier ? "Edit supplier" : "Add supplier"}
          description={
            editingSupplier
              ? "Update contact, purchasing, and website information."
              : "Create a supplier for purchase orders and invoices."
          }
          onClose={closeForm}
          wide
        >
          <form
            key={editingSupplier?.id ?? "new"}
            onSubmit={saveSupplier}
            className="space-y-4 p-5"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" name="name" defaultValue={editingSupplier?.name} required autoFocus />
              <Field label="Contact name" name="contact_name" defaultValue={editingSupplier?.contact_name ?? ""} />
              <Field label="Phone" name="phone" type="tel" defaultValue={editingSupplier?.phone ?? ""} />
              <Field label="Email" name="email" type="email" defaultValue={editingSupplier?.email ?? ""} />
              <Field label="Website" name="website" type="text" inputMode="url" placeholder="https://example.com" defaultValue={editingSupplier?.website ?? ""} />
              <Field label="Account number" name="account_number" defaultValue={editingSupplier?.account_number ?? ""} />
              <Field label="Payment terms" name="payment_terms" placeholder="Net 30" defaultValue={editingSupplier?.payment_terms ?? ""} />
              <Field label="Brands" name="brands" placeholder="Michelin, Goodyear" defaultValue={editingSupplier?.brands.join(", ") ?? ""} />
              <Field label="Lead time (days)" name="lead_time_days" type="number" min="0" step="1" defaultValue={editingSupplier?.lead_time_days ?? ""} />
              <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium text-zinc-800">
                <input
                  name="is_active"
                  value="true"
                  type="checkbox"
                  defaultChecked={editingSupplier?.is_active ?? true}
                  className="size-4 accent-red-600"
                />
                Active supplier
              </label>
            </div>
            <Field label="Address" name="address" defaultValue={editingSupplier?.address ?? ""} />
            <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
              Notes
              <textarea name="notes" defaultValue={editingSupplier?.notes ?? ""} maxLength={1000} className="min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20" />
            </label>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingSupplier ? "Save changes" : "Add supplier"}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete supplier?"
          description={`${deleteTarget.name} will be permanently deleted.`}
          onClose={() => !deleting && setDeleteTarget(null)}
        >
          <div className="space-y-4 p-5">
            <p className="text-sm text-zinc-700">
              Suppliers connected to existing orders cannot be deleted. You can mark
              them inactive from the edit form instead.
            </p>
            {deleteError && <p role="alert" className="text-sm text-red-700">{deleteError}</p>}
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
              <Button type="button" variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" disabled={deleting} onClick={deleteSupplier}>
                {deleting ? "Deleting..." : "Delete supplier"}
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
  return (
    <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
      {label}
      <input {...props} className={inputClass} />
    </label>
  );
}
