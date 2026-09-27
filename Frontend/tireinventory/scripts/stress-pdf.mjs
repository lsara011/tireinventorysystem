import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

const highVolumeRows = Number.parseInt(process.env.PDF_STRESS_ROWS ?? "12000", 10);

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function createRows(count, noteLength = 40) {
  const note = "Customer requested a detailed service record. ".repeat(
    Math.ceil(noteLength / 44),
  );
  return Array.from({ length: count }, (_, index) => {
    const quantity = (index % 4) + 1;
    const unitCost = 35 + (index % 90);
    const unitRevenue = unitCost + 15 + (index % 55);
    return [
      `09/${String((index % 28) + 1).padStart(2, "0")}/2026`,
      `Receipt ${100000 + index}`,
      `Customer ${index} | 225/60R16`,
      index % 5 === 0 ? "New tire" : index % 3 === 0 ? "Used tire" : "Service",
      quantity,
      money(unitCost * quantity),
      money(unitRevenue * quantity),
      note.slice(0, noteLength),
    ];
  });
}

function buildPdf(name, rows) {
  const started = performance.now();
  const memoryBefore = process.memoryUsage().heapUsed;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(`Stress Test: ${name}`, 40, 46);
  autoTable(doc, {
    startY: 64,
    head: [["Sales", "Collected", "Costs", "Profit", "Balance"]],
    body: [[money(900000), money(750000), money(500000), money(400000), money(150000)]],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 4 },
  });
  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY ?? 100) + 20,
    margin: { top: 40, right: 40, bottom: 42, left: 40 },
    head: [["Date", "Receipt", "Customer / tire", "Type", "Qty", "Cost", "Received", "Note"]],
    body: rows,
    theme: "grid",
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 4,
      overflow: "linebreak",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 55 },
      4: { halign: "right", cellWidth: 25 },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.text(`Page ${page} of ${pageCount}`, 752, pageHeight - 16, { align: "right" });
  }

  const output = doc.output("arraybuffer");
  const prefix = new TextDecoder().decode(new Uint8Array(output, 0, 4));
  const durationMs = performance.now() - started;
  const heapGrowthMb = (process.memoryUsage().heapUsed - memoryBefore) / 1024 / 1024;

  assert.equal(prefix, "%PDF", `${name} did not create a PDF payload`);
  assert.ok(output.byteLength > 1_000, `${name} produced an unexpectedly small file`);
  assert.ok(pageCount >= 1, `${name} did not produce any pages`);
  assert.ok(doc.lastAutoTable?.finalY, `${name} did not complete the detail table`);

  return {
    scenario: name,
    rows: rows.length,
    pages: pageCount,
    megabytes: Number((output.byteLength / 1024 / 1024).toFixed(2)),
    seconds: Number((durationMs / 1000).toFixed(2)),
    heapGrowthMb: Number(heapGrowthMb.toFixed(1)),
  };
}

const scenarios = [
  ["typical day", createRows(250)],
  ["high volume", createRows(highVolumeRows)],
  ["long customer notes", createRows(600, 500)],
  [
    "special characters",
    createRows(750).map((row, index) => [
      ...row.slice(0, 2),
      `O'Brien, Jose Alvarez #${index} | Size 33x12.50R20`,
      ...row.slice(3, 7),
      `Cash, card | warranty #${index} / $${index}`,
    ]),
  ],
];

const results = [];
for (const [name, rows] of scenarios) {
  results.push(buildPdf(name, rows));
  if (global.gc) global.gc();
}

console.table(results);
console.log(
  JSON.stringify({
    totalRows: results.reduce((sum, result) => sum + result.rows, 0),
    totalPages: results.reduce((sum, result) => sum + result.pages, 0),
    peakRssMb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  }),
);
