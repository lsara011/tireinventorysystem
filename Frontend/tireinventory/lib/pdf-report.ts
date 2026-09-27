import type { jsPDF } from "jspdf";
import type { Table, UserOptions } from "jspdf-autotable";

type PdfValue = string | number;

export type PdfSummaryItem = {
  label: string;
  value: string;
};

export type PdfSection = {
  title: string;
  head: string[];
  body: PdfValue[][];
  columnStyles?: UserOptions["columnStyles"];
};

type PdfReportOptions = {
  filename: string;
  title: string;
  subtitle: string;
  orientation?: "portrait" | "landscape";
  summary: PdfSummaryItem[];
  sections: PdfSection[];
};

type PdfWithTable = jsPDF & { lastAutoTable?: Table };

const colors = {
  ink: [24, 24, 27] as [number, number, number],
  muted: [82, 82, 91] as [number, number, number],
  border: [212, 212, 216] as [number, number, number],
  soft: [244, 244, 245] as [number, number, number],
};

export async function exportPdfReport({
  filename,
  title,
  subtitle,
  orientation = "portrait",
  summary,
  sections,
}: PdfReportOptions) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation, unit: "pt", format: "letter" }) as PdfWithTable;
  const margin = 40;
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setProperties({
    title,
    subject: subtitle,
    author: "Tire Inventory System",
    creator: "Tire Inventory System",
  });
  doc.setTextColor(...colors.ink);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, margin, 46);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...colors.muted);
  doc.setFontSize(10);
  doc.text(subtitle, margin, 64);
  doc.text(`Generated ${new Date().toLocaleString("en-US")}`, margin, 79);

  autoTable(doc, {
    startY: 94,
    margin: { left: margin, right: margin },
    head: [summary.map((item) => item.label)],
    body: [summary.map((item) => item.value)],
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 6,
      lineColor: colors.border,
      lineWidth: 0.5,
      textColor: colors.ink,
      halign: "center",
    },
    headStyles: {
      fillColor: colors.soft,
      textColor: colors.muted,
      fontStyle: "bold",
    },
    bodyStyles: { fontStyle: "bold" },
  });

  let nextY = (doc.lastAutoTable?.finalY ?? 130) + 24;
  for (const section of sections.filter((item) => item.body.length > 0)) {
    if (nextY > pageHeight - 100) {
      doc.addPage();
      nextY = 46;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...colors.ink);
    doc.text(section.title, margin, nextY);

    autoTable(doc, {
      startY: nextY + 9,
      margin: { top: margin, right: margin, bottom: 42, left: margin },
      head: [section.head],
      body: section.body,
      theme: "grid",
      showHead: "everyPage",
      rowPageBreak: "avoid",
      styles: {
        font: "helvetica",
        fontSize: 8,
        cellPadding: 4,
        lineColor: colors.border,
        lineWidth: 0.4,
        textColor: colors.ink,
        overflow: "linebreak",
        valign: "middle",
      },
      headStyles: {
        fillColor: colors.ink,
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      columnStyles: section.columnStyles,
    });
    nextY = (doc.lastAutoTable?.finalY ?? nextY + 30) + 24;
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...colors.border);
    doc.line(margin, pageHeight - 30, doc.internal.pageSize.getWidth() - margin, pageHeight - 30);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    doc.text("Tire Inventory System", margin, pageHeight - 16);
    doc.text(
      `Page ${page} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - margin,
      pageHeight - 16,
      { align: "right" },
    );
  }

  doc.save(filename);
}
