import { DailySalesManager, type DailySale } from "./DailySalesManager";

async function getDailySales(date: string): Promise<DailySale[]> {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error("Backend API URL is not configured");

  const response = await fetch(
    `${apiUrl.replace(/\/$/, "")}/sales?sale_date=${encodeURIComponent(date)}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Unable to load daily sales");
  return response.json();
}

export default async function SalesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const sales = await getDailySales(today);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <DailySalesManager initialSales={sales} today={today} />
    </main>
  );
}
