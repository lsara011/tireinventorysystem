import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

const url = process.env.STRESS_URL ?? "http://127.0.0.1:3000/login";
const requestCount = Number.parseInt(process.env.STRESS_REQUESTS ?? "1000", 10);
const concurrency = Number.parseInt(process.env.STRESS_CONCURRENCY ?? "50", 10);
const expectedStatuses = new Set(
  (process.env.STRESS_EXPECTED_STATUS ?? "200")
    .split(",")
    .map((status) => Number.parseInt(status.trim(), 10)),
);
const cookie = process.env.STRESS_COOKIE;

assert.ok(requestCount > 0, "STRESS_REQUESTS must be positive");
assert.ok(concurrency > 0, "STRESS_CONCURRENCY must be positive");

const latencies = [];
const statuses = new Map();
const errors = [];
let nextRequest = 0;
const suiteStarted = performance.now();

async function worker() {
  while (true) {
    const requestNumber = nextRequest;
    nextRequest += 1;
    if (requestNumber >= requestCount) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const started = performance.now();
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: cookie ? { Cookie: cookie } : undefined,
        redirect: "manual",
        signal: controller.signal,
      });
      await response.arrayBuffer();
      const elapsed = performance.now() - started;
      latencies.push(elapsed);
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      if (!expectedStatuses.has(response.status)) {
        errors.push(`Request ${requestNumber}: unexpected HTTP ${response.status}`);
      }
    } catch (error) {
      errors.push(
        `Request ${requestNumber}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

latencies.sort((a, b) => a - b);
const durationMs = performance.now() - suiteStarted;
const percentile = (value) =>
  latencies[Math.min(Math.ceil((value / 100) * latencies.length) - 1, latencies.length - 1)] ?? 0;
const result = {
  url,
  requests: requestCount,
  concurrency,
  requestsPerSecond: Number((requestCount / (durationMs / 1000)).toFixed(1)),
  p50Ms: Number(percentile(50).toFixed(1)),
  p95Ms: Number(percentile(95).toFixed(1)),
  p99Ms: Number(percentile(99).toFixed(1)),
  maxMs: Number((latencies.at(-1) ?? 0).toFixed(1)),
  statuses: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => a - b)),
  errors: errors.length,
};

console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) console.error(errors.slice(0, 20).join("\n"));
assert.equal(errors.length, 0, `${errors.length} requests failed`);
