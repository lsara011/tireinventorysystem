import assert from "node:assert/strict";

const apiUrl = (process.env.REPORT_TEST_API_URL ?? "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);
const reportYear = Number.parseInt(
  process.env.REPORT_TEST_YEAR ?? String(new Date().getFullYear()),
  10,
);
const businessTimeZone =
  process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ?? "America/New_York";

assert.ok(Number.isInteger(reportYear), "REPORT_TEST_YEAR must be a valid year");

async function request(path, expectedStatus = 200) {
  const response = await fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => null);
  assert.equal(
    response.status,
    expectedStatus,
    `${path} returned ${response.status}: ${JSON.stringify(body)}`,
  );
  return body;
}

function dateText(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthRange(year, month) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: dateText(year, month, 1),
    end: dateText(year, month, lastDay),
  };
}

function businessDate(timestamp) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: businessTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function getSales(start, end) {
  return request(
    `/sales?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`,
  );
}

function saleAmounts(sale) {
  return sale.items.reduce(
    (totals, item) => {
      assert.ok(Number.isInteger(item.quantity) && item.quantity > 0);
      assert.ok(Number.isInteger(item.unit_price) && item.unit_price >= 0);
      assert.ok(Number.isInteger(item.unit_cost) && item.unit_cost >= 0);
      totals.units += item.quantity;
      totals.revenue += item.quantity * item.unit_price;
      totals.cost += item.quantity * item.unit_cost;
      return totals;
    },
    { units: 0, revenue: 0, cost: 0 },
  );
}

function measureSales(sales, start, end) {
  assert.equal(
    new Set(sales.map((sale) => sale.id)).size,
    sales.length,
    `Duplicate sale IDs returned for ${start} through ${end}`,
  );

  const bookedSales = sales.filter(
    (sale) => sale.sale_date >= start && sale.sale_date <= end,
  );
  const bookedIds = new Set(bookedSales.map((sale) => sale.id));
  const totals = {
    transactions: 0,
    units: 0,
    revenue: 0,
    cost: 0,
    paidByEnd: 0,
    balanceAtEnd: 0,
    payments: 0,
    cash: 0,
    bookedSalesCash: 0,
    priorPeriodCash: 0,
  };

  for (const sale of bookedSales) {
    const amounts = saleAmounts(sale);
    const paidByEnd = Math.min(
      amounts.revenue,
      sale.payments
        .filter((payment) => payment.payment_date <= end)
        .reduce((sum, payment) => sum + payment.amount, 0),
    );
    totals.transactions += 1;
    totals.units += amounts.units;
    totals.revenue += amounts.revenue;
    totals.cost += amounts.cost;
    totals.paidByEnd += paidByEnd;
    totals.balanceAtEnd += Math.max(amounts.revenue - paidByEnd, 0);
  }

  for (const sale of sales) {
    const relatesToRange =
      bookedIds.has(sale.id) ||
      sale.payments.some(
        (payment) =>
          payment.payment_date >= start && payment.payment_date <= end,
      );
    assert.ok(relatesToRange, `Sale ${sale.id} does not belong in the response`);

    for (const payment of sale.payments) {
      assert.ok(Number.isInteger(payment.amount) && payment.amount > 0);
      if (payment.payment_date < start || payment.payment_date > end) continue;
      totals.payments += 1;
      totals.cash += payment.amount;
      if (bookedIds.has(sale.id)) {
        totals.bookedSalesCash += payment.amount;
      } else {
        totals.priorPeriodCash += payment.amount;
      }
    }
  }

  assert.equal(
    totals.revenue,
    totals.paidByEnd + totals.balanceAtEnd,
    "Booked revenue does not reconcile to paid plus period-end balance",
  );
  assert.equal(
    totals.cash,
    totals.bookedSalesCash + totals.priorPeriodCash,
    "Cash does not reconcile by sale period",
  );
  return totals;
}

function sumMonthly(months, key) {
  return months.reduce((sum, month) => sum + month[key], 0);
}

const yearStart = `${reportYear}-01-01`;
const yearEnd = `${reportYear}-12-31`;
const annualSales = await getSales(yearStart, yearEnd);
const annual = measureSales(annualSales, yearStart, yearEnd);
const months = [];

for (let month = 1; month <= 12; month += 1) {
  const range = monthRange(reportYear, month);
  const measured = measureSales(await getSales(range.start, range.end), range.start, range.end);
  months.push({ month: range.start.slice(0, 7), ...measured });
}

for (const key of ["transactions", "units", "revenue", "cost", "cash"]) {
  assert.equal(
    annual[key],
    sumMonthly(months, key),
    `Annual ${key} does not equal the sum of monthly ${key}`,
  );
}

assert.ok(annualSales.length > 0, `No reportable sales found for ${reportYear}`);
const sampleDate = annualSales.find(
  (sale) => sale.sale_date >= yearStart && sale.sale_date <= yearEnd,
)?.sale_date;
assert.ok(sampleDate, `No booked sale date found for ${reportYear}`);
const exactDay = await request(`/sales?sale_date=${encodeURIComponent(sampleDate)}`);
const rangedDay = await getSales(sampleDate, sampleDate);
assert.deepEqual(
  exactDay.map((sale) => sale.id).sort((a, b) => a - b),
  rangedDay.map((sale) => sale.id).sort((a, b) => a - b),
  "Exact-day and one-day range queries returned different sales",
);

await request(`/sales?start_date=${yearStart}`, 400);
await request(`/sales?start_date=${yearEnd}&end_date=${yearStart}`, 400);
await request(
  `/sales?sale_date=${sampleDate}&start_date=${sampleDate}&end_date=${sampleDate}`,
  400,
);

const allSales = await request("/sales");
assert.equal(new Set(allSales.map((sale) => sale.id)).size, allSales.length);
const history = await request("/tire-history");
assert.equal(new Set(history.map((entry) => entry.id)).size, history.length);
const tires = await request("/tires");
assert.equal(new Set(tires.map((tire) => tire.id)).size, tires.length);

const yearlyHistory = history.filter((entry) =>
  businessDate(entry.created_at).startsWith(String(reportYear)),
);
const monthlyHistoryCount = Array.from({ length: 12 }, (_, index) => {
  const prefix = `${reportYear}-${String(index + 1).padStart(2, "0")}`;
  return history.filter((entry) => businessDate(entry.created_at).startsWith(prefix))
    .length;
}).reduce((sum, count) => sum + count, 0);
assert.equal(yearlyHistory.length, monthlyHistoryCount);

console.table(
  months.map((month) => ({
    month: month.month,
    transactions: month.transactions,
    revenue: month.revenue,
    cost: month.cost,
    cash: month.cash,
  })),
);
console.log(
  JSON.stringify(
    {
      year: reportYear,
      annual,
      allSales: allSales.length,
      tireHistory: history.length,
      tires: tires.length,
      sampleDate,
      status: "passed",
    },
    null,
    2,
  ),
);
