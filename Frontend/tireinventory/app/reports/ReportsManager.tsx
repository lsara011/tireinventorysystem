"use client";

import * as React from "react";
import { Download, FileDown, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportPdfReport } from "@/lib/pdf-report";

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

function csvValue(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function ReportsManager({
  entries,
  tires,
  defaultDate,
}: {
  entries: ReportEntry[];
  tires: ReportTire[];
  defaultDate: string;
}) {
  const [reason, setReason] = React.useState<"all" | ReportReason>("all");
  const [period, setPeriod] = React.useState<ReportPeriod>("daily");
  const [reportDate, setReportDate] = React.useState(defaultDate);
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const [exportError, setExportError] = React.useState("");

  const filtered = entries.filter((entry) => {
    const entryDate = entry.created_at.slice(0, 10);
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

  const breakdown = Object.entries(reasonLabels).map(([value, label]) => {
    const matching = filtered.filter((entry) => entry.reason === value);
    return { value: value as ReportReason, label, ...totalsFor(matching) };
  });

  function exportCsv() {
    const headers = [
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
    const rows = filtered.map((entry) => {
      const removed = quantity(entry);
      const cost = entry.unit_cost;
      const revenue = entry.unit_revenue;
      return [
        entry.created_at,
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
    const csv = [headers, ...rows]
      .map((row) => row.map(csvValue).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-${period}-report-${reportDate}.csv`;
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
        filename: `inventory-${period}-report-${reportDate}.pdf`,
        title: "Inventory Activity Report",
        subtitle: `${periodLabel} | ${reason === "all" ? "All reasons" : reasonLabels[reason]}`,
        orientation: "landscape",
        summary: [
          { label: "Sales revenue", value: currency.format(salesTotals.revenue) },
          { label: "Cost sold", value: currency.format(salesTotals.cost) },
          { label: "Sales profit", value: currency.format(salesProfit) },
          { label: "Damage loss", value: currency.format(damageLoss) },
          { label: "Inventory value", value: currency.format(inventoryValue) },
        ],
        sections: [
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
            Financial results from sold, damaged, returned, and adjusted stock
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[auto_10rem_12rem_auto]">
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
          <label className="grid gap-1 text-xs font-medium text-zinc-600">
            Report date
            <input type="date" value={reportDate} onChange={(event) => { if (event.target.value) setReportDate(event.target.value); }} className={inputClass} required />
          </label>
          <label className="grid gap-1 text-xs font-medium text-zinc-600">
            Reason
            <select value={reason} onChange={(event) => setReason(event.target.value as "all" | ReportReason)} className={inputClass}>
              <option value="all">All reasons</option>
              {Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => { setReason("all"); setPeriod("daily"); setReportDate(defaultDate); }} aria-label="Reset report filters" title="Reset filters">
              <RotateCcw className="size-4" aria-hidden="true" />
            </Button>
            <Button type="button" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="size-4" aria-hidden="true" /> CSV
            </Button>
            <Button type="button" onClick={exportPdf} disabled={filtered.length === 0 || exportingPdf}>
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

      <section aria-label="Report summary" className="grid border-y border-zinc-200 bg-white sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Sales revenue" value={currency.format(salesTotals.revenue)} detail={`${salesTotals.sold} sold`} />
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
