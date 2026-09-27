"use client";

import * as React from "react";
import {
  CircleDollarSign,
  FileDown,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { exportPdfReport } from "@/lib/pdf-report";

const categoryLabels = {
  patch: "Patch",
  plug: "Plug",
  used_tire: "Used tire",
  new_tire: "New tire",
  valve_stem: "Valve stem",
  balancing: "Balancing",
  oil_change: "Oil change",
  other: "Other",
} as const;

type SaleCategory = keyof typeof categoryLabels;
type PaymentMethod = "cash" | "card" | "check" | "other";
type PaymentStatus =
  | "unpaid"
  | "deposit"
  | "partially_paid"
  | "paid"
  | "cancelled"
  | "refunded";

const paymentStatusLabels: Record<PaymentStatus, string> = {
  unpaid: "Unpaid",
  deposit: "Deposit",
  partially_paid: "Partially paid",
  paid: "Paid",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const paymentStatusStyles: Record<PaymentStatus, string> = {
  unpaid: "bg-red-50 text-red-700 ring-red-200",
  deposit: "bg-amber-50 text-amber-800 ring-amber-200",
  partially_paid: "bg-amber-50 text-amber-800 ring-amber-200",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelled: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  refunded: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

export type DailySaleItem = {
  id: number;
  category: SaleCategory;
  description: string | null;
  tire_size: string | null;
  valve_type: "regular" | "sensor" | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
};

export type DailySale = {
  id: number;
  sale_date: string;
  receipt_number: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  vehicle: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  due_date: string | null;
  notes: string | null;
  created_at: string;
  items: DailySaleItem[];
  payments: DailySalePayment[];
};

export type DailySalePayment = {
  id: number;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  note: string | null;
  created_at: string;
};

type EditableItem = {
  key: string;
  category: SaleCategory;
  description: string;
  tire_size: string;
  valve_type: "regular" | "sensor";
  quantity: string;
  unit_price: string;
  unit_cost: string;
};

const inputClass =
  "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function emptyItem(key = crypto.randomUUID()): EditableItem {
  return {
    key,
    category: "patch",
    description: "",
    tire_size: "",
    valve_type: "regular",
    quantity: "1",
    unit_price: "0",
    unit_cost: "0",
  };
}

function saleTotals(sale: DailySale) {
  return sale.items.reduce(
    (totals, item) => {
      totals.revenue += item.quantity * item.unit_price;
      totals.cost += item.quantity * item.unit_cost;
      totals.units += item.quantity;
      return totals;
    },
    { revenue: 0, cost: 0, units: 0 },
  );
}

function amountPaid(sale: DailySale) {
  return sale.payments.reduce((total, payment) => total + payment.amount, 0);
}

function balanceDue(sale: DailySale) {
  return Math.max(saleTotals(sale).revenue - amountPaid(sale), 0);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function itemDescription(item: DailySaleItem) {
  const details: string[] = [categoryLabels[item.category]];
  if (item.tire_size) details.push(item.tire_size);
  if (item.valve_type) {
    details.push(item.valve_type === "sensor" ? "Sensor" : "Regular");
  }
  if (item.description) details.push(item.description);
  return details.join(" | ");
}

export function DailySalesManager({
  initialSales,
  today,
}: {
  initialSales: DailySale[];
  today: string;
}) {
  const [sales, setSales] = React.useState(initialSales);
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [adding, setAdding] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [paymentTarget, setPaymentTarget] = React.useState<DailySale | null>(null);
  const [paymentSaving, setPaymentSaving] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState("");
  const [paymentMode, setPaymentMode] = React.useState<"full" | "down">("full");
  const [downPayment, setDownPayment] = React.useState("");
  const [saleDate, setSaleDate] = React.useState(selectedDate);
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const [error, setError] = React.useState("");
  const [pageError, setPageError] = React.useState("");
  const [lineItems, setLineItems] = React.useState<EditableItem[]>([
    emptyItem("initial"),
  ]);

  const dailyTotals = sales.reduce(
    (totals, sale) => {
      const saleTotal = saleTotals(sale);
      if (sale.sale_date === selectedDate) {
        totals.revenue += saleTotal.revenue;
        totals.cost += saleTotal.cost;
        totals.items += saleTotal.units;
        totals.transactions += 1;
      }
      const paymentsToday = sale.payments.filter(
        (payment) => payment.payment_date === selectedDate,
      );
      totals.collected += paymentsToday.reduce(
        (sum, payment) => sum + payment.amount,
        0,
      );
      totals.payments += paymentsToday.length;
      totals.outstanding += balanceDue(sale);
      return totals;
    },
    {
      revenue: 0,
      cost: 0,
      items: 0,
      transactions: 0,
      collected: 0,
      payments: 0,
      outstanding: 0,
    },
  );

  const editableTotal = lineItems.reduce(
    (total, item) => total + Number(item.quantity) * Number(item.unit_price),
    0,
  );

  async function changeDate(date: string) {
    if (!date) return;
    setSelectedDate(date);
    setLoading(true);
    setPageError("");
    try {
      const response = await fetch(`/api/sales?date=${encodeURIComponent(date)}`, {
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : "Unable to load daily sales.",
        );
      }
      setSales(body as DailySale[]);
    } catch (caughtError) {
      setPageError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load daily sales.",
      );
    } finally {
      setLoading(false);
    }
  }

  function closeForm() {
    setAdding(false);
    setError("");
    setPaymentMode("full");
    setDownPayment("");
    setSaleDate(selectedDate);
    setLineItems([emptyItem()]);
  }

  function updateLine(key: string, changes: Partial<EditableItem>) {
    setLineItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );
  }

  async function saveSale(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const customerName = String(form.get("customer_name") ?? "").trim();
    const receiptNumber = String(form.get("receipt_number") ?? "").trim();
    const dueDate = String(form.get("due_date") ?? "").trim();
    const hasNewTire = lineItems.some((item) => item.category === "new_tire");

    if (hasNewTire && (!customerName || !receiptNumber)) {
      setError("New tire sales require a customer name and receipt number.");
      setSaving(false);
      return;
    }

    const initialPayment =
      paymentMode === "full" ? editableTotal : Number(downPayment);
    if (
      paymentMode === "down" &&
      (!Number.isInteger(initialPayment) ||
        initialPayment < 1 ||
        initialPayment >= editableTotal)
    ) {
      setError("The down payment must be at least $1 and less than the sale total.");
      setSaving(false);
      return;
    }
    if (paymentMode === "down" && (!customerName || !dueDate)) {
      setError("A customer name and due date are required for a down payment.");
      setSaving(false);
      return;
    }

    const payload = {
      sale_date: String(form.get("sale_date") ?? selectedDate),
      receipt_number: receiptNumber || null,
      customer_name: customerName || null,
      customer_phone: String(form.get("customer_phone") ?? "").trim() || null,
      customer_email: String(form.get("customer_email") ?? "").trim() || null,
      vehicle: String(form.get("vehicle") ?? "").trim() || null,
      payment_method: String(form.get("payment_method") ?? "cash"),
      initial_payment: initialPayment,
      due_date: paymentMode === "down" ? dueDate : null,
      notes: String(form.get("notes") ?? "").trim() || null,
      items: lineItems.map((item) => ({
        category: item.category,
        description: item.description.trim() || null,
        tire_size:
          item.category === "used_tire" || item.category === "new_tire"
            ? item.tire_size.trim() || null
            : null,
        valve_type: item.category === "valve_stem" ? item.valve_type : null,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        unit_cost: Number(item.unit_cost),
      })),
    };

    try {
      const response = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const validationMessage = Array.isArray(body?.detail)
          ? body.detail.at(-1)?.msg
          : null;
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : validationMessage ?? "Unable to record sale.",
        );
      }

      const saved = body as DailySale;
      if (saved.sale_date === selectedDate) {
        setSales((current) => [saved, ...current]);
      } else {
        await changeDate(saved.sale_date);
      }
      closeForm();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to record sale.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function addPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentTarget) return;

    setPaymentSaving(true);
    setPaymentError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/sales/${paymentTarget.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_date: String(form.get("payment_date") ?? today),
          amount: Number(form.get("amount")),
          payment_method: String(form.get("payment_method") ?? "cash"),
          note: String(form.get("note") ?? "").trim() || null,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const validationMessage = Array.isArray(body?.detail)
          ? body.detail.at(-1)?.msg
          : null;
        throw new Error(
          typeof body?.detail === "string"
            ? body.detail
            : validationMessage ?? "Unable to record payment.",
        );
      }

      const saved = body as DailySale;
      setSales((current) =>
        current.map((sale) => (sale.id === saved.id ? saved : sale)),
      );
      setPaymentTarget(null);
    } catch (caughtError) {
      setPaymentError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to record payment.",
      );
    } finally {
      setPaymentSaving(false);
    }
  }

  async function exportDailySalesPdf() {
    setExportingPdf(true);
    setPageError("");
    const bookedSales = sales.filter((sale) => sale.sale_date === selectedDate);
    const paymentsReceived = sales.flatMap((sale) =>
      sale.payments
        .filter((payment) => payment.payment_date === selectedDate)
        .map((payment) => ({ sale, payment })),
    );

    try {
      await exportPdfReport({
        filename: `daily-sales-${selectedDate}.pdf`,
        title: "Daily Sales Report",
        subtitle: formatDate(selectedDate),
        orientation: "landscape",
        summary: [
          { label: "Sales booked", value: currency.format(dailyTotals.revenue) },
          { label: "Cash collected", value: currency.format(dailyTotals.collected) },
          { label: "Costs", value: currency.format(dailyTotals.cost) },
          {
            label: "Gross profit",
            value: currency.format(dailyTotals.revenue - dailyTotals.cost),
          },
          { label: "Open balance", value: currency.format(dailyTotals.outstanding) },
        ],
        sections: [
          {
            title: "Sales booked",
            head: [
              "Receipt",
              "Customer",
              "Items",
              "Sale total",
              "Paid",
              "Balance",
              "Status",
              "Due date",
            ],
            body: bookedSales.map((sale) => {
              const totals = saleTotals(sale);
              return [
                sale.receipt_number || `Sale ${sale.id}`,
                sale.customer_name || "Walk-in customer",
                sale.items.reduce((sum, item) => sum + item.quantity, 0),
                currency.format(totals.revenue),
                currency.format(amountPaid(sale)),
                currency.format(balanceDue(sale)),
                paymentStatusLabels[sale.payment_status],
                sale.due_date ? formatDate(sale.due_date) : "",
              ];
            }),
            columnStyles: {
              2: { halign: "right", cellWidth: 30 },
              3: { halign: "right" },
              4: { halign: "right" },
              5: { halign: "right" },
            },
          },
          {
            title: "Line items",
            head: [
              "Receipt",
              "Customer",
              "Work / item",
              "Qty",
              "Price each",
              "Cost each",
              "Line total",
            ],
            body: bookedSales.flatMap((sale) =>
              sale.items.map((item) => [
                sale.receipt_number || `Sale ${sale.id}`,
                sale.customer_name || "Walk-in customer",
                itemDescription(item),
                item.quantity,
                currency.format(item.unit_price),
                currency.format(item.unit_cost),
                currency.format(item.quantity * item.unit_price),
              ]),
            ),
            columnStyles: {
              3: { halign: "right", cellWidth: 28 },
              4: { halign: "right" },
              5: { halign: "right" },
              6: { halign: "right" },
            },
          },
          {
            title: "Payments received",
            head: ["Receipt", "Customer", "Method", "Amount", "Note"],
            body: paymentsReceived.map(({ sale, payment }) => [
              sale.receipt_number || `Sale ${sale.id}`,
              sale.customer_name || "Walk-in customer",
              payment.payment_method,
              currency.format(payment.amount),
              payment.note ?? "",
            ]),
            columnStyles: { 3: { halign: "right" } },
          },
        ],
      });
    } catch {
      setPageError("Unable to create the daily sales PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Daily Sales</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Services, tires, customer receipts, and daily totals
          </p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-end gap-2">
          <label className="grid gap-1 text-xs font-medium text-zinc-600">
            Sales date
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => changeDate(event.target.value)}
              className={inputClass}
            />
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={exportDailySalesPdf}
            disabled={sales.length === 0 || exportingPdf}
            aria-label="Export daily sales as PDF"
            title={exportingPdf ? "Creating PDF" : "Export PDF"}
          >
            <FileDown className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            onClick={() => {
              setSaleDate(selectedDate);
              setAdding(true);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Record sale
          </Button>
        </div>
      </div>

      <section aria-label="Daily sales summary" className="grid border-y border-zinc-200 bg-white sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Sales booked"
          value={currency.format(dailyTotals.revenue)}
          detail={`${dailyTotals.transactions} transactions | ${dailyTotals.items} items`}
        />
        <Metric
          label="Cash collected"
          value={currency.format(dailyTotals.collected)}
          detail={`${dailyTotals.payments} payments received`}
        />
        <Metric
          label="Balance due"
          value={currency.format(dailyTotals.outstanding)}
          detail="Open balance on displayed sales"
        />
        <Metric
          label="Gross profit"
          value={currency.format(dailyTotals.revenue - dailyTotals.cost)}
          detail="On sales booked this day"
        />
      </section>

      {pageError && <p role="alert" className="mt-4 text-sm text-red-700">{pageError}</p>}

      <section className="mt-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-950">
            {new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
              new Date(`${selectedDate}T00:00:00`),
            )}
          </h2>
          {loading && <span className="text-sm text-zinc-500">Loading...</span>}
        </div>

        {!loading && sales.length === 0 ? (
          <div className="mt-3 border-y border-zinc-200 py-12 text-center text-sm text-zinc-600">
            No sales recorded for this date.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-md border border-zinc-200 bg-white">
            {sales.map((sale) => {
              const totals = saleTotals(sale);
              const paid = amountPaid(sale);
              const balance = balanceDue(sale);
              return (
                <article key={sale.id} className="border-b border-zinc-200 last:border-0">
                  <div className="grid gap-3 p-4 md:grid-cols-[1.2fr_1.4fr_1fr_auto] md:items-center">
                    <div>
                      <p className="font-medium text-zinc-950">
                        {sale.receipt_number ? `Receipt ${sale.receipt_number}` : `Sale ${sale.id}`}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Sale date {formatDate(sale.sale_date)}
                      </p>
                    </div>
                    <div className="text-sm text-zinc-600">
                      <p>{sale.customer_name || "Walk-in customer"}</p>
                      {sale.vehicle && <p className="mt-1 text-xs text-zinc-500">{sale.vehicle}</p>}
                    </div>
                    <div>
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${paymentStatusStyles[sale.payment_status]}`}>
                        {paymentStatusLabels[sale.payment_status]}
                      </span>
                      {sale.due_date && balance > 0 && (
                        <p className="mt-1.5 text-xs text-zinc-500">
                          Due {formatDate(sale.due_date)}
                        </p>
                      )}
                    </div>
                    <div className="text-left md:text-right">
                      <p className="font-semibold text-zinc-950">{currency.format(totals.revenue)}</p>
                      <p className={`mt-1 text-xs ${balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                        {balance > 0
                          ? `${currency.format(balance)} due`
                          : `${currency.format(paid)} paid`}
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-zinc-200 border-t border-zinc-200 bg-zinc-50 px-4">
                    {sale.items.map((item) => (
                      <div key={item.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                        <div>
                          <p className="text-zinc-800">{itemDescription(item)}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">Qty {item.quantity}</p>
                        </div>
                        <p className="shrink-0 font-medium text-zinc-800">
                          {currency.format(item.quantity * item.unit_price)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-zinc-200 px-4 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-zinc-600">
                        <span>{currency.format(paid)} paid</span>
                        <span aria-hidden="true"> | </span>
                        <span>{currency.format(balance)} remaining</span>
                      </div>
                      {balance > 0 &&
                        !["cancelled", "refunded"].includes(sale.payment_status) && (
                          <Button
                            type="button"
                            size="sm"
                            className="w-full sm:w-auto"
                            onClick={() => {
                              setPaymentError("");
                              setPaymentTarget(sale);
                            }}
                          >
                            <CircleDollarSign className="size-4" aria-hidden="true" />
                            Record payment
                          </Button>
                        )}
                    </div>
                    {sale.payments.length > 0 && (
                      <div className="mt-3 divide-y divide-zinc-200 border-t border-zinc-200">
                        {sale.payments.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-start justify-between gap-4 py-2 text-xs text-zinc-600"
                          >
                            <div>
                              <p>
                                {formatDate(payment.payment_date)} | {payment.payment_method}
                              </p>
                              {payment.note && (
                                <p className="mt-0.5 text-zinc-500">{payment.note}</p>
                              )}
                            </div>
                            <p className="shrink-0 font-medium text-zinc-900">
                              {currency.format(payment.amount)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {adding && (
        <Modal title="Record daily sale" description="Add the customer, receipt, and work completed." onClose={closeForm} wide>
          <form onSubmit={saveSale} className="space-y-5 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Sale date"
                name="sale_date"
                type="date"
                value={saleDate}
                onChange={(event) => setSaleDate(event.target.value)}
                required
                autoFocus
              />
              <Field label="Receipt number" name="receipt_number" placeholder="Required for new tires" />
              <Field label="Customer name" name="customer_name" placeholder="Required for new tires" />
              <Field label="Phone" name="customer_phone" type="tel" />
              <Field label="Email" name="customer_email" type="email" />
              <Field label="Vehicle" name="vehicle" placeholder="Year, make, model" />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-zinc-900">Work and items</h3>
                <Button type="button" variant="outline" size="sm" onClick={() => setLineItems((current) => [...current, emptyItem()])}>
                  <Plus className="size-4" aria-hidden="true" /> Add item
                </Button>
              </div>
              <div className="space-y-3">
                {lineItems.map((item) => (
                  <SaleLine key={item.key} item={item} canRemove={lineItems.length > 1} onChange={(changes) => updateLine(item.key, changes)} onRemove={() => setLineItems((current) => current.filter((line) => line.key !== item.key))} />
                ))}
              </div>
            </div>

            <fieldset className="border-y border-zinc-200 py-4">
              <legend className="px-1 text-sm font-semibold text-zinc-900">
                Payment plan
              </legend>
              <div className="mt-2 inline-flex w-full rounded-md border border-zinc-300 p-1 sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPaymentMode("full")}
                  className={`h-9 flex-1 rounded px-4 text-sm font-medium sm:flex-none ${
                    paymentMode === "full"
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  Paid in full
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("down")}
                  className={`h-9 flex-1 rounded px-4 text-sm font-medium sm:flex-none ${
                    paymentMode === "down"
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-100"
                  }`}
                >
                  Down payment
                </button>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                  Payment method
                  <select name="payment_method" className={inputClass} defaultValue="cash">
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                    <option value="check">Check</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                {paymentMode === "down" && (
                  <Field
                    label="Due date"
                    name="due_date"
                    type="date"
                    min={saleDate}
                    required
                  />
                )}
                {paymentMode === "down" && (
                  <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                    Down payment
                    <input
                      type="number"
                      min="1"
                      max={Math.max(editableTotal - 1, 1)}
                      step="1"
                      value={downPayment}
                      onChange={(event) => setDownPayment(event.target.value)}
                      className={inputClass}
                      required
                    />
                  </label>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 divide-x divide-zinc-200 border-y border-zinc-200 py-3 text-center">
                <PaymentAmount label="Sale total" value={editableTotal} />
                <PaymentAmount
                  label="Paid now"
                  value={paymentMode === "full" ? editableTotal : Number(downPayment) || 0}
                />
                <PaymentAmount
                  label="Balance"
                  value={Math.max(
                    editableTotal -
                      (paymentMode === "full" ? editableTotal : Number(downPayment) || 0),
                    0,
                  )}
                />
              </div>
            </fieldset>

            <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
              Notes
              <textarea name="notes" maxLength={1000} className="min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20" />
            </label>

            <div className="flex items-center gap-2 border-y border-zinc-200 py-3 text-sm text-zinc-600">
              <ReceiptText className="size-4" aria-hidden="true" />
              New tire sales require a receipt number and customer name.
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Recording..." : "Record sale"}</Button>
            </div>
          </form>
        </Modal>
      )}

      {paymentTarget && (
        <Modal
          title="Record payment"
          description={`${paymentTarget.customer_name || `Sale ${paymentTarget.id}`} | ${currency.format(balanceDue(paymentTarget))} remaining`}
          onClose={() => {
            setPaymentTarget(null);
            setPaymentError("");
          }}
        >
          <form onSubmit={addPayment} className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Payment date"
                name="payment_date"
                type="date"
                defaultValue={today}
                required
                autoFocus
              />
              <Field
                label="Amount"
                name="amount"
                type="number"
                min="1"
                max={balanceDue(paymentTarget)}
                step="1"
                defaultValue={balanceDue(paymentTarget)}
                required
              />
              <label className="grid gap-1.5 text-sm font-medium text-zinc-800">
                Payment method
                <select name="payment_method" className={inputClass} defaultValue="cash">
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="check">Check</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Field label="Note" name="note" maxLength={500} placeholder="Optional" />
            </div>
            {paymentError && (
              <p role="alert" className="text-sm text-red-700">
                {paymentError}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPaymentTarget(null);
                  setPaymentError("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={paymentSaving}>
                {paymentSaving ? "Recording..." : "Record payment"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function SaleLine({ item, canRemove, onChange, onRemove }: { item: EditableItem; canRemove: boolean; onChange: (changes: Partial<EditableItem>) => void; onRemove: () => void }) {
  const isTire = item.category === "used_tire" || item.category === "new_tire";
  return (
    <div className="grid gap-3 rounded-md border border-zinc-200 p-3 sm:grid-cols-2 lg:grid-cols-6">
      <label className="grid gap-1 text-xs font-medium text-zinc-600 lg:col-span-2">
        Category
        <select value={item.category} onChange={(event) => onChange({ category: event.target.value as SaleCategory })} className={inputClass}>
          {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      {isTire && <LineField label="Tire size" value={item.tire_size} onChange={(value) => onChange({ tire_size: value })} required />}
      {item.category === "valve_stem" && (
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Valve type
          <select value={item.valve_type} onChange={(event) => onChange({ valve_type: event.target.value as "regular" | "sensor" })} className={inputClass}>
            <option value="regular">Regular</option><option value="sensor">Sensor</option>
          </select>
        </label>
      )}
      <LineField label={item.category === "other" ? "Description" : "Details"} value={item.description} onChange={(value) => onChange({ description: value })} required={item.category === "other"} />
      <LineField label="Qty" type="number" min="1" step="1" value={item.quantity} onChange={(value) => onChange({ quantity: value })} required />
      <LineField label="Price each" type="number" min="0" step="1" value={item.unit_price} onChange={(value) => onChange({ unit_price: value })} required />
      <LineField label="Cost each" type="number" min="0" step="1" value={item.unit_cost} onChange={(value) => onChange({ unit_cost: value })} required />
      <Button type="button" variant="outline" size="icon" className="self-end" disabled={!canRemove} onClick={onRemove} aria-label="Remove sale item" title="Remove item">
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="border-b border-zinc-200 p-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><p className="text-xs font-medium uppercase text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold text-zinc-950">{value}</p>{detail && <p className="mt-1 text-xs text-zinc-500">{detail}</p>}</div>;
}

function PaymentAmount({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 px-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-zinc-950">
        {currency.format(Number.isFinite(value) ? value : 0)}
      </p>
    </div>
  );
}

type FieldProps = React.ComponentProps<"input"> & { label: string };
function Field({ label, ...props }: FieldProps) {
  return <label className="grid gap-1.5 text-sm font-medium text-zinc-800">{label}<input {...props} className={inputClass} /></label>;
}

function LineField({ label, onChange, ...props }: Omit<React.ComponentProps<"input">, "onChange"> & { label: string; onChange: (value: string) => void }) {
  return <label className="grid gap-1 text-xs font-medium text-zinc-600">{label}<input {...props} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>;
}
