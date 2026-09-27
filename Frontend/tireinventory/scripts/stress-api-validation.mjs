import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const apiUrl = (process.env.STRESS_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const requestCount = Number.parseInt(process.env.STRESS_VALIDATION_REQUESTS ?? "1200", 10);
const concurrency = Number.parseInt(process.env.STRESS_CONCURRENCY ?? "40", 10);

const cases = [
  { path: "/sales", body: { sale_date: "bad-date", initial_payment: -1, items: [] } },
  {
    path: "/sales/1/payments",
    body: { payment_date: "2026-09-27", amount: 0, payment_method: "cash" },
  },
  {
    path: "/tires",
    body: { tire_brand: "", tire_quantity: -1, tire_size: "", tire_price: -1, tire_location: "" },
  },
  {
    path: "/tires/1/remove-stock",
    body: { quantity: 0, unit_cost: -1, unit_revenue: -1, reason: "invalid" },
  },
  {
    path: "/orders",
    body: { supplier_id: 1, invoice_number: "", invoice_date: "bad", total_amount: -1 },
  },
  { path: "/suppliers", body: { name: "", lead_time_days: -1 } },
];

const statuses = new Map();
const latencies = [];
const errors = [];
let nextRequest = 0;
const suiteStarted = performance.now();

async function worker() {
  while (true) {
    const requestNumber = nextRequest;
    nextRequest += 1;
    if (requestNumber >= requestCount) return;
    const testCase = cases[requestNumber % cases.length];
    const started = performance.now();
    try {
      const response = await fetch(`${apiUrl}${testCase.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testCase.body),
      });
      await response.arrayBuffer();
      latencies.push(performance.now() - started);
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      if (response.status !== 422) {
        errors.push(`${testCase.path} returned HTTP ${response.status}`);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
latencies.sort((a, b) => a - b);
const durationMs = performance.now() - suiteStarted;
const percentile = (value) =>
  latencies[Math.min(Math.ceil((value / 100) * latencies.length) - 1, latencies.length - 1)] ?? 0;

console.log(
  JSON.stringify(
    {
      requests: requestCount,
      concurrency,
      requestsPerSecond: Number((requestCount / (durationMs / 1000)).toFixed(1)),
      p50Ms: Number(percentile(50).toFixed(1)),
      p95Ms: Number(percentile(95).toFixed(1)),
      p99Ms: Number(percentile(99).toFixed(1)),
      statuses: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a - b)),
      errors: errors.length,
    },
    null,
    2,
  ),
);
if (errors.length > 0) console.error(errors.slice(0, 20).join("\n"));
assert.equal(errors.length, 0, `${errors.length} validation requests failed`);
