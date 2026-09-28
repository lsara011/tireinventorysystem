"use client";

import * as React from "react";
import { Download, FileDown, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { businessDate } from "@/lib/date";
import { exportPdfReport } from "@/lib/pdf-report";
import type { DailySale } from "@/app/sales/DailySalesManager";

const reasonLabels = {
  sold: "Sold",
  damaged: "Damaged",
  returned_to_supplier: "Returned to supplier",
  inventory_correction: "Inventory correction",
  other: "Other",
} as const;

type ReportReason = keyof typeof reasonLabels;
type ReportPeriod = "daily" | "monthly" | "yearly";

export type ReportTire = {
  id: number;
  tire_brand: string;
  tire_size: string;
  tire_quantity: number;
  tire_price: number;
  tire_location: string;
};

export type ReportEntry = {
  id: number;
  tire_id: number;
  tire_snapshot: ReportTire;
  reason: ReportReason;
  note: string | null;
  quantity_removed: number | null;
  quantity_before: number | null;
  quantity_after: number | null;
  unit_cost?: number | null;
  unit_revenue?: number | null;
  created_at: string;
};

const inputClass =
  "h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, "0"),
  label: new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(2024, index, 1),
  ),
}));

function quantity(entry: ReportEntry) {
  return entry.quantity_removed ?? entry.tire_snapshot.tire_quantity;
}

function totalsFor(entries: ReportEntry[]) {
  return entries.reduce(
    (totals, entry) => {
      const removed = quantity(entry);
      const hasFinancials = entry.unit_cost != null && entry.unit_revenue != null;
      totals.units += removed;
      if (entry.reason === "sold") totals.sold += removed;
      if (hasFinancials) {
        totals.cost += entry.unit_cost! * removed;
        totals.revenue += entry.unit_revenue! * removed;
        totals.recorded += 1;
      }
      return totals;
    },
    { units: 0, sold: 0, cost: 0, revenue: 0, recorded: 0 },
  );
}

function reportRange(period: ReportPeriod, reportDate: string) {
  const year = Number(reportDate.slice(0, 4));
  const month = Number(reportDate.slice(5, 7));

  if (period === "daily") {
    return { start: reportDate, end: reportDate };
  }
  if (period === "monthly") {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      start: `${reportDate.slice(0, 7)}-01`,
      end: `${reportDate.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}

function saleAmounts(sale: DailySale) {
  return sale.items.reduce(
    (totals, item) => {
      totals.units += item.quantity;
      totals.revenue += item.quantity * item.unit_price;
      totals.cost += item.quantity * item.unit_cost;
      return totals;
    },
    { units: 0, revenue: 0, cost: 0 },
  );
}

function paidThrough(sale: DailySale, endDate: string) {
  return sale.payments.reduce(
    (total, payment) =>
      payment.payment_date <= endDate ? total + payment.amount : total,
    0,
  );
}

function csvValue(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function ReportsManager({
  entries,
  tires,
  initialSales,
  defaultDate,
}: {
  entries: ReportEntry[];
  tires: ReportTire[];
  initialSales: DailySale[];
  defaultDate: string;
}) {
  const [reason, setReason] = React.useState<"all" | ReportReason>("all");
  const [period, setPeriod] = React.useState<ReportPeriod>("daily");
  const [reportDate, setReportDate] = React.useState(defaultDate);
  const [sales, setSales] = React.useState(initialSales);
  const [loadedSalesRange, setLoadedSalesRange] = React.useState({
    start: defaultDate,
    end: defaultDate,
  });
  const [salesLoading, setSalesLoading] = React.useState(false);
  const [salesError, setSalesError] = React.useState("");
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const [exportError, setExportError] = React.useState("");
  const range = reportRange(period, reportDate);
  const selectedMonth = reportDate.slice(5, 7);
  const selectedYear = reportDate.slice(0, 4);
  const currentYear = Number(defaultDate.slice(0, 4));
  const reportYears = Array.from(
    { length: Math.max(currentYear - 2000 + 1, 1) },
    (_, index) => String(currentYear - index),
  );
  if (!reportYears.includes(selectedYear)) reportYears.unshift(selectedYear);

  React.useEffect(() => {
    const controller = new AbortController();

    async function loadSales() {
      setSalesLoading(true);
      setSalesError("");
      try {
        const response = await fetch(
          `/api/sales?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof body?.detail === "string"
              ? body.detail
              : "Unable to load sales for this period.",
          );
        }
        setSales(body as DailySale[]);
        setLoadedSalesRange({ start: range.start, end: range.end });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSalesError(
          error instanceof Error
            ? error.message
            : "Unable to load sales for this period.",
        );
      } finally {
        if (!controller.signal.aborted) setSalesLoading(false);
      }
    }

    void loadSales();
    return () => controller.abort();
  }, [range.start, range.end]);

  const filtered = entries.filter((entry) => {
    const entryDate = businessDate(entry.created_at);
    const matchesPeriod =
      period === "daily"
        ? entryDate === reportDate
        : period === "monthly"
          ? entryDate.startsWith(reportDate.slice(0, 7))
          : entryDate.startsWith(reportDate.slice(0, 4));
    return (
      (reason === "all" || entry.reason === reason) &&
      matchesPeriod
    );
  });
  const totals = totalsFor(filtered);
  const salesTotals = totalsFor(
    filtered.filter((entry) => entry.reason === "sold"),
  );
  const damageTotals = totalsFor(
    filtered.filter((entry) => entry.reason === "damaged"),
  );
  const salesProfit = salesTotals.revenue - salesTotals.cost;
  const damageLoss = Math.max(damageTotals.cost - damageTotals.revenue, 0);
  const inventoryUnits = tires.reduce((sum, tire) => sum + tire.tire_quantity, 0);
  const inventoryValue = tires.reduce(
    (sum, tire) => sum + tire.tire_quantity * tire.tire_price,
    0,
  );
  const missingFinancials = filtered.length - totals.recorded;
  const reportSales =
    loadedSalesRange.start === range.start && loadedSalesRange.end === range.end
      ? sales
      : [];
  const bookedSales = reportSales.filter(
    (sale) => sale.sale_date >= range.start && sale.sale_date <= range.end,
  );
  const bookedSaleIds = new Set(bookedSales.map((sale) => sale.id));
  const dailySalesTotals = bookedSales.reduce(
    (totals, sale) => {
      const amounts = saleAmounts(sale);
      const paidByPeriodEnd = Math.min(
        amounts.revenue,
        paidThrough(sale, range.end),
      );
      totals.transactions += 1;
      totals.units += amounts.units;
      totals.revenue += amounts.revenue;
      totals.cost += amounts.cost;
      totals.paid += paidByPeriodEnd;
      totals.balance += Math.max(amounts.revenue - paidByPeriodEnd, 0);
      return totals;
    },
    {
      transactions: 0,
      units: 0,
      revenue: 0,
      cost: 0,
      paid: 0,
      balance: 0,
    },
  );
  const periodPayments = reportSales.flatMap((sale) =>
    sale.payments
      .filter(
        (payment) =>
          payment.payment_date >= range.start &&
          payment.payment_date <= range.end,
      )
      .map((payment) => ({ saleId: sale.id, payment })),
  );
  const cashCollected = periodPayments.reduce(
    (total, entry) => total + entry.payment.amount,
    0,
  );
  const bookedSalesPayments = periodPayments.filter((entry) =>
    bookedSaleIds.has(entry.saleId),
  );
  const priorPeriodPayments = periodPayments.filter(
    (entry) => !bookedSaleIds.has(entry.saleId),
  );
  const bookedSalesCash = bookedSalesPayments.reduce(
    (total, entry) => total + entry.payment.amount,
    0,
  );
  const priorPeriodCash = priorPeriodPayments.reduce(
    (total, entry) => total + entry.payment.amount,
    0,
  );
  const dailySalesProfit = dailySalesTotals.revenue - dailySalesTotals.cost;

  const breakdown = Object.entries(reasonLabels).map(([value, label]) => {
    const matching = filtered.filter((entry) => entry.reason === value);
    return { value: value as ReportReason, label, ...totalsFor(matching) };
  });

  function exportCsv() {
    const salesHeaders = [
      "Sale date",
      "Receipt",
      "Customer",
      "Units",
      "Booked revenue",
      "Cost",
      "Gross profit",
      "Paid by period end",
      "Balance at period end",
      "Payment status",
    ];
    const salesRows = bookedSales.map((sale) => {
      const amounts = saleAmounts(sale);
      const paid = Math.min(amounts.revenue, paidThrough(sale, range.end));
      return [
        sale.sale_date,
        sale.receipt_number ?? "",
        sale.customer_name ?? "Walk-in customer",
        amounts.units,
        amounts.revenue,
        amounts.cost,
        amounts.revenue - amounts.cost,
        paid,
        Math.max(amounts.revenue - paid, 0),
        sale.payment_status,
      ];
    });
    const removalHeaders = [
      "Date",
      "Reason",
      "Brand",
      "Size",
      "Quantity",
      "Unit cost",
      "Unit revenue",
      "Total cost",
      "Total revenue",
      "Net",
      "Note",
    ];
    const removalRows = filtered.map((entry) => {
      const removed = quantity(entry);
      const cost = entry.unit_cost;
      const revenue = entry.unit_revenue;
      return [
        businessDate(entry.created_at),
        reasonLabels[entry.reason],
        entry.tire_snapshot.tire_brand,
        entry.tire_snapshot.tire_size,
        removed,
        cost ?? "",
        revenue ?? "",
        cost == null ? "" : cost * removed,
        revenue == null ? "" : revenue * removed,
        cost == null || revenue == null ? "" : (revenue - cost) * removed,
        entry.note ?? "",
      ];
    });
    const csv = [
      ["Daily sales"],
      salesHeaders,
      ...salesRows,
      [],
      ["Cash collection"],
      ["Source", "Payment count", "Amount"],
      [
        "Sales booked during this period",
        bookedSalesPayments.length,
        bookedSalesCash,
      ],
      [
        "Balances from earlier periods",
        priorPeriodPayments.length,
        priorPeriodCash,
      ],
      ["Total cash collected", periodPayments.length, cashCollected],
      [],
      ["Inventory removals"],
      removalHeaders,
      ...removalRows,
    ]
      .map((row) => row.map(csvValue).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `business-${period}-report-${reportDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    setExportingPdf(true);
    setExportError("");
    const periodLabel =
      period === "daily"
        ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
            new Date(`${reportDate}T00:00:00`),
          )
        : period === "monthly"
          ? new Intl.DateTimeFormat("en-US", {
              month: "long",
              year: "numeric",
            }).format(new Date(`${reportDate.slice(0, 7)}-01T00:00:00`))
          : reportDate.slice(0, 4);

    try {
      await exportPdfReport({
        filename: `business-${period}-report-${reportDate}.pdf`,
        title: "Business Activity Report",
        subtitle: `${periodLabel} | ${reason === "all" ? "All reasons" : reasonLabels[reason]}`,
        orientation: "landscape",
        summary: [
          { label: "Sales booked", value: currency.format(dailySalesTotals.revenue) },
          { label: "Sales cost", value: currency.format(dailySalesTotals.cost) },
          { label: "Gross profit", value: currency.format(dailySalesProfit) },
          { label: "Paid on these sales", value: currency.format(dailySalesTotals.paid) },
          { label: "Balance at period end", value: currency.format(dailySalesTotals.balance) },
          { label: "Cash collected", value: currency.format(cashCollected) },
        ],
        sections: [
          {
            title: "Daily sales activity",
            head: [
              "Date",
              "Receipt",
              "Customer",
              "Items",
              "Booked",
              "Cost",
              "Paid",
              "Balance",
            ],
            body: bookedSales.map((sale) => {
              const amounts = saleAmounts(sale);
              const paid = Math.min(
                amounts.revenue,
                paidThrough(sale, range.end),
              );
              return [
                new Intl.DateTimeFormat("en-US", {
                  dateStyle: "short",
                }).format(new Date(`${sale.sale_date}T00:00:00`)),
                sale.receipt_number ?? `Sale ${sale.id}`,
                sale.customer_name ?? "Walk-in customer",
                sale.items
                  .map(
                    (item) =>
                      `${item.quantity}x ${item.description ?? item.category.replaceAll("_", " ")}`,
                  )
                  .join("; "),
                currency.format(amounts.revenue),
                currency.format(amounts.cost),
                currency.format(paid),
                currency.format(Math.max(amounts.revenue - paid, 0)),
              ];
            }),
            columnStyles: {
              0: { cellWidth: 50 },
              3: { cellWidth: 150 },
              4: { halign: "right" },
              5: { halign: "right" },
              6: { halign: "right" },
              7: { halign: "right" },
            },
          },
          {
            title: "Cash collection",
            head: ["Source", "Payments", "Amount"],
            body: [
              [
                "Sales booked during this period",
                bookedSalesPayments.length,
                currency.format(bookedSalesCash),
              ],
              [
                "Balances from earlier periods",
                priorPeriodPayments.length,
                currency.format(priorPeriodCash),
              ],
              [
                "Total cash collected",
                periodPayments.length,
                currency.format(cashCollected),
              ],
            ],
            columnStyles: {
              1: { halign: "right" },
              2: { halign: "right" },
            },
          },
          {
            title: "Results by reason",
            head: ["Reason", "Units", "Cost", "Received", "Gain / loss"],
            body: breakdown.map((row) => [
              row.label,
              row.units,
              currency.format(row.cost),
              currency.format(row.revenue),
              currency.format(row.revenue - row.cost),
            ]),
            columnStyles: {
              1: { halign: "right" },
              2: { halign: "right" },
              3: { halign: "right" },
              4: { halign: "right" },
            },
          },
          {
            title: "Removal activity",
            head: [
              "Date",
              "Tire",
              "Reason",
              "Qty",
              "Cost",
              "Received",
              "Gain / loss",
              "Note",
            ],
            body: filtered.map((entry) => {
              const removed = quantity(entry);
              const hasFinancials =
                entry.unit_cost != null && entry.unit_revenue != null;
              const net = hasFinancials
                ? (entry.unit_revenue! - entry.unit_cost!) * removed
                : null;
              return [
                new Intl.DateTimeFormat("en-US", { dateStyle: "short" }).format(
                  new Date(entry.created_at),
                ),
                `${entry.tire_snapshot.tire_brand} ${entry.tire_snapshot.tire_size}`,
                reasonLabels[entry.reason],
                removed,
                entry.unit_cost == null
                  ? "Not recorded"
                  : currency.format(entry.unit_cost * removed),
                entry.unit_revenue == null
                  ? "Not recorded"
                  : currency.format(entry.unit_revenue * removed),
                net == null ? "Not recorded" : currency.format(net),
                entry.note ?? "",
              ];
            }),
            columnStyles: {
              0: { cellWidth: 58 },
              3: { halign: "right", cellWidth: 28 },
              4: { halign: "right" },
              5: { halign: "right" },
              6: { halign: "right" },
            },
          },
        ],
      });
    } catch {
      setExportError("Unable to create the PDF. Please try again.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-950">Reports</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Sales, payments, inventory removals, and current stock value
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[auto_minmax(15rem,1fr)_12rem_auto]">
          <fieldset className="grid gap-1">
            <legend className="text-xs font-medium text-zinc-600">Period</legend>
            <div className="flex h-10 overflow-hidden rounded-md border border-zinc-300 bg-white">
              {(["daily", "monthly", "yearly"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  aria-pressed={period === value}
                  className={`px-3 text-sm font-medium capitalize transition-colors ${
                    period === value
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
          {period === "daily" ? (
            <label className="grid gap-1 text-xs font-medium text-zinc-600">
              Report day
              <input
                type="date"
                value={reportDate}
                onChange={(event) => {
                  if (event.target.value) setReportDate(event.target.value);
                }}
                className={inputClass}
                required
              />
            </label>
          ) : period === "monthly" ? (
            <fieldset className="grid gap-1">
              <legend className="text-xs font-medium text-zinc-600">
                Report month
              </legend>
              <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                <select
                  value={selectedMonth}
                  onChange={(event) =>
                    setReportDate(`${selectedYear}-${event.target.value}-01`)
                  }
                  className={inputClass}
                  aria-label="Month"
                >
                  {monthOptions.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(event) =>
                    setReportDate(`${event.target.value}-${selectedMonth}-01`)
                  }
                  className={inputClass}
                  aria-label="Year"
                >
                  {reportYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </fieldset>
          ) : (
            <label className="grid gap-1 text-xs font-medium text-zinc-600">
              Report year
              <select
                value={selectedYear}
                onChange={(event) =>
                  setReportDate(`${event.target.value}-01-01`)
                }
                className={inputClass}
              >
                {reportYears.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs font-medium text-zinc-600">
            Removal reason
            <select value={reason} onChange={(event) => setReason(event.target.value as "all" | ReportReason)} className={inputClass}>
              <option value="all">All reasons</option>
              {Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => { setReason("all"); setPeriod("daily"); setReportDate(defaultDate); }} aria-label="Reset report filters" title="Reset filters">
              <RotateCcw className="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" onClick={exportCsv} disabled={salesLoading || (filtered.length === 0 && bookedSales.length === 0)}>
              <Download className="size-4" aria-hidden="true" /> CSV
            </Button>
            <Button type="button" onClick={exportPdf} disabled={salesLoading || (filtered.length === 0 && bookedSales.length === 0) || exportingPdf}>
              <FileDown className="size-4" aria-hidden="true" />
              {exportingPdf ? "Creating..." : "PDF"}
            </Button>
          </div>
        </div>
      </div>

      {exportError && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {exportError}
        </p>
      )}

      {salesError && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {salesError}
        </p>
      )}

      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-zinc-950">Sales summary</h2>
        {salesLoading && <span className="text-sm text-zinc-500">Loading sales...</span>}
      </div>
      <section aria-label="Sales summary" className="grid border-y border-zinc-200 bg-white sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Metric label="Sales booked" value={salesLoading ? "Loading..." : currency.format(dailySalesTotals.revenue)} detail={`${dailySalesTotals.transactions} transactions | ${dailySalesTotals.units} items`} />
        <Metric label="Sales cost" value={salesLoading ? "Loading..." : currency.format(dailySalesTotals.cost)} detail="Sales booked this period" />
        <Metric label="Gross profit" value={salesLoading ? "Loading..." : `${dailySalesProfit < 0 ? "-" : "+"}${currency.format(Math.abs(dailySalesProfit))}`} detail={dailySalesProfit < 0 ? "Sales loss" : "Sales gain"} tone={dailySalesProfit < 0 ? "loss" : "gain"} />
        <Metric label="Paid on these sales" value={salesLoading ? "Loading..." : currency.format(dailySalesTotals.paid)} detail="Received by period end" />
        <Metric label="Balance at period end" value={salesLoading ? "Loading..." : currency.format(dailySalesTotals.balance)} detail="Booked equals paid plus balance" />
        <Metric label="Cash collected" value={salesLoading ? "Loading..." : currency.format(cashCollected)} detail={`${currency.format(priorPeriodCash)} from earlier sales`} />
      </section>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-zinc-950">Inventory summary</h2>

      <section aria-label="Report summary" className="grid border-y border-zinc-200 bg-white sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Tire removal revenue" value={currency.format(salesTotals.revenue)} detail={`${salesTotals.sold} sold`} />
        <Metric label="Cost of tires sold" value={currency.format(salesTotals.cost)} detail="Sales only" />
        <Metric label="Sales profit" value={`${salesProfit < 0 ? "-" : "+"}${currency.format(Math.abs(salesProfit))}`} detail={salesProfit < 0 ? "Sales loss" : "Sales gain"} tone={salesProfit < 0 ? "loss" : "gain"} />
        <Metric label="Damage loss" value={currency.format(damageLoss)} detail={`${damageTotals.units} damaged`} tone={damageLoss > 0 ? "loss" : undefined} />
        <Metric label="Current inventory" value={currency.format(inventoryValue)} detail={`${inventoryUnits} units on hand`} />
      </section>

      {missingFinancials > 0 && (
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {missingFinancials} older {missingFinancials === 1 ? "record has" : "records have"} no cost or revenue saved and are excluded from financial totals.
        </p>
      )}

      <section className="mt-8 min-w-0 max-w-full">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-950">Sales activity</h2>
          <p className="text-sm text-zinc-500">{bookedSales.length} {bookedSales.length === 1 ? "sale" : "sales"}</p>
        </div>
        {!salesLoading && bookedSales.length === 0 ? (
          <p className="mt-3 border-y border-zinc-200 py-10 text-center text-sm text-zinc-600">No sales were booked during this period.</p>
        ) : bookedSales.length > 0 ? (
          <div className="mt-3 w-full max-w-[calc(100vw-2rem)] overflow-x-auto overscroll-x-contain rounded-md border border-zinc-200 bg-white sm:max-w-full">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Receipt</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Units</th><th className="px-4 py-3">Booked</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Paid by end</th><th className="px-4 py-3">Balance at end</th><th className="px-4 py-3">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {bookedSales.map((sale) => {
                  const amounts = saleAmounts(sale);
                  const paid = Math.min(
                    amounts.revenue,
                    paidThrough(sale, range.end),
                  );
                  const balance = Math.max(amounts.revenue - paid, 0);
                  return <tr key={sale.id}><td className="whitespace-nowrap px-4 py-3 text-zinc-600">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(`${sale.sale_date}T00:00:00`))}</td><td className="px-4 py-3 font-medium text-zinc-900">{sale.receipt_number ?? `Sale ${sale.id}`}</td><td className="px-4 py-3 text-zinc-600">{sale.customer_name ?? "Walk-in customer"}</td><td className="px-4 py-3 text-zinc-600">{amounts.units}</td><td className="px-4 py-3 text-zinc-600">{currency.format(amounts.revenue)}</td><td className="px-4 py-3 text-zinc-600">{currency.format(amounts.cost)}</td><td className="px-4 py-3 text-zinc-600">{currency.format(paid)}</td><td className={balance > 0 ? "px-4 py-3 font-medium text-amber-700" : "px-4 py-3 text-zinc-600"}>{currency.format(balance)}</td><td className="px-4 py-3 capitalize text-zinc-600">{sale.payment_status.replaceAll("_", " ")}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="mt-8 min-w-0 max-w-full">
        <h2 className="text-lg font-semibold text-zinc-950">Results by reason</h2>
        <div className="mt-3 w-full max-w-[calc(100vw-2rem)] overflow-x-auto overscroll-x-contain rounded-md border border-zinc-200 bg-white sm:max-w-full">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Units</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Gain / loss</th></tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {breakdown.map((row) => {
                const rowNet = row.revenue - row.cost;
                return <tr key={row.value}><td className="px-4 py-3 font-medium text-zinc-900">{row.label}</td><td className="px-4 py-3 text-zinc-600">{row.units}</td><td className="px-4 py-3 text-zinc-600">{currency.format(row.cost)}</td><td className="px-4 py-3 text-zinc-600">{currency.format(row.revenue)}</td><td className={`px-4 py-3 font-medium ${rowNet < 0 ? "text-red-700" : "text-emerald-700"}`}>{rowNet < 0 ? "-" : "+"}{currency.format(Math.abs(rowNet))}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 min-w-0 max-w-full">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-lg font-semibold text-zinc-950">Removal activity</h2>
          <p className="text-sm text-zinc-500">{filtered.length} {filtered.length === 1 ? "record" : "records"}</p>
        </div>
        {filtered.length === 0 ? (
          <p className="mt-3 border-y border-zinc-200 py-10 text-center text-sm text-zinc-600">No activity matches these filters.</p>
        ) : (
          <div className="mt-3 w-full max-w-[calc(100vw-2rem)] overflow-x-auto overscroll-x-contain rounded-md border border-zinc-200 bg-white sm:max-w-full">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Tire</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Qty</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Received</th><th className="px-4 py-3">Gain / loss</th></tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {filtered.map((entry) => {
                  const removed = quantity(entry);
                  const hasFinancials = entry.unit_cost != null && entry.unit_revenue != null;
                  const entryNet = hasFinancials ? (entry.unit_revenue! - entry.unit_cost!) * removed : null;
                  return <tr key={entry.id}><td className="whitespace-nowrap px-4 py-3 text-zinc-600">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(entry.created_at))}</td><td className="px-4 py-3"><p className="font-medium text-zinc-900">{entry.tire_snapshot.tire_brand}</p><p className="text-xs text-zinc-500">{entry.tire_snapshot.tire_size}</p></td><td className="px-4 py-3 text-zinc-600">{reasonLabels[entry.reason]}</td><td className="px-4 py-3 text-zinc-600">{removed}</td><td className="px-4 py-3 text-zinc-600">{entry.unit_cost == null ? "Not recorded" : currency.format(entry.unit_cost * removed)}</td><td className="px-4 py-3 text-zinc-600">{entry.unit_revenue == null ? "Not recorded" : currency.format(entry.unit_revenue * removed)}</td><td className={`px-4 py-3 font-medium ${entryNet !== null && entryNet < 0 ? "text-red-700" : "text-emerald-700"}`}>{entryNet === null ? "Not recorded" : `${entryNet < 0 ? "-" : "+"}${currency.format(Math.abs(entryNet))}`}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "gain" | "loss" }) {
  return (
    <div className="border-b border-zinc-200 p-4 last:border-0 sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:border-r lg:last:border-r-0">
      <p className="text-xs font-medium uppercase text-zinc-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${tone === "loss" ? "text-red-700" : tone === "gain" ? "text-emerald-700" : "text-zinc-950"}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
