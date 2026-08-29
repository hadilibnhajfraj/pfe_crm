"use strict";

// Exercise the real pdfkit builder directly (no HTTP layer) — confirms the
// document it returns is a genuine, well-formed PDF stream that finalizes
// correctly, independently of how the controller pipes/ends it.

const { buildReportPdf } = require("../src/modules/ai-copilot/services/reportPdf.service");

function drain(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

describe("reportPdf.service — buildReportPdf", () => {
  test("produces a real PDF buffer (starts with the %PDF magic bytes, ends with %%EOF)", async () => {
    const doc = buildReportPdf({ title: "Rapport KPI", content: "3 projets en retard." });
    const buffer = await drain(doc);

    expect(buffer.slice(0, 4).toString("ascii")).toBe("%PDF");
    expect(buffer.slice(-1024).toString("latin1")).toContain("%%EOF");
    expect(buffer.length).toBeGreaterThan(200); // more than just an empty-page skeleton
  });

  test("falls back to a default title when none is provided, without throwing", async () => {
    const doc = buildReportPdf({ content: "Contenu sans titre." });
    const buffer = await drain(doc);
    expect(buffer.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  test("falls back to a default title when it is only whitespace", async () => {
    const doc = buildReportPdf({ title: "   ", content: "Contenu." });
    const buffer = await drain(doc);
    expect(buffer.slice(0, 4).toString("ascii")).toBe("%PDF");
  });

  test("handles a long multi-paragraph report without throwing (pdfkit auto-paginates)", async () => {
    const longContent = Array.from({ length: 200 }, (_, i) => `Ligne ${i + 1} du rapport avec un peu de contenu pour remplir la page.`).join("\n");
    const doc = buildReportPdf({ title: "Rapport long", content: longContent });
    const buffer = await drain(doc);
    expect(buffer.slice(0, 4).toString("ascii")).toBe("%PDF");
  });
});
