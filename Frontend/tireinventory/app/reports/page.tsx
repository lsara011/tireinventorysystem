import { ReportsManager, type ReportEntry, type ReportTire } from "./ReportsManager";

async function getReportData() {
  const apiUrl = process.env.API_URL;
  if (!apiUrl) throw new Error("Backend API URL is not configured");

  const [historyResponse, tiresResponse] = await Promise.all([
    fetch(`${apiUrl}/tire-history`, { cache: "no-store" }),
    fetch(`${apiUrl}/tires`, { cache: "no-store" }),
  ]);

  if (!historyResponse.ok || !tiresResponse.ok) {
    throw new Error("Unable to load report data");
  }

  return {
    entries: (await historyResponse.json()) as ReportEntry[],
    tires: (await tiresResponse.json()) as ReportTire[],
  };
}

export default async function ReportsPage() {
  const { entries, tires } = await getReportData();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden px-4 py-8 sm:px-6 lg:px-8">
      <ReportsManager entries={entries} tires={tires} defaultDate={today} />
    </main>
  );
}
