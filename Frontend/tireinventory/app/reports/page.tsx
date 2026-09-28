import { ReportsManager, type ReportEntry, type ReportTire } from "./ReportsManager";
import type { DailySale } from "../sales/DailySalesManager";
import { businessDate } from "@/lib/date";

async function getReportData(date: string) {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error("Backend API URL is not configured");

  const [historyResponse, tiresResponse, salesResponse] = await Promise.all([
    fetch(`${apiUrl}/tire-history`, { cache: "no-store" }),
    fetch(`${apiUrl}/tires`, { cache: "no-store" }),
    fetch(`${apiUrl}/sales?sale_date=${encodeURIComponent(date)}`, {
      cache: "no-store",
    }),
  ]);

  if (!historyResponse.ok || !tiresResponse.ok || !salesResponse.ok) {
    throw new Error("Unable to load report data");
  }

  return {
    entries: (await historyResponse.json()) as ReportEntry[],
    tires: (await tiresResponse.json()) as ReportTire[],
    sales: (await salesResponse.json()) as DailySale[],
  };
}

export default async function ReportsPage() {
  const today = businessDate();
  const { entries, tires, sales } = await getReportData(today);

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8">
      <ReportsManager
        entries={entries}
        tires={tires}
        initialSales={sales}
        defaultDate={today}
      />
    </main>
  );
}
