"use strict";

// Module Rapports — rendu commun Excel (exceljs) et PDF (pdfkit) à partir
// d'une définition { title, period, filters, generatedAt, requestedBy, scope,
// kpis, sheets, notes }. Même identité visuelle que l'export Production
// existant (bandeau « CBI TUNISIA ») : aucun fichier de logo n'existe dans le
// dépôt, donc aucune image n'est insérée.

const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");

const COLORS = Object.freeze({ ink: "0F172A", navy: "17365D", sub: "64748B", border: "E2E8F0", band: "F1F5F9", accent: "2563EB" });
const PDF_MAX_ROWS = 300; // lignes par tableau dans un PDF
const DATE_FMT = "dd/mm/yyyy";
const NUMBER_FMT = "#,##0.00";
const INTEGER_FMT = "#,##0";
const PAGE = { margin: 28 };

const pad = (n) => String(n).padStart(2, "0");
const frDateTime = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const frDate = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

// Neutralise les formules : une cellule texte commençant par = + - @ serait
// interprétée par Excel (injection de formule via une donnée saisie dans le CRM).
function safeText(value) {
  if (value === null || value === undefined) return null;
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function cellValue(column, row) {
  const raw = row[column.key];
  if (column.type === "date") return toDate(raw);
  if (column.type === "number" || column.type === "integer") return toNumber(raw);
  return safeText(raw);
}

function metaLines(def) {
  const lines = [`Période : ${def.period}`];
  lines.push(`Filtres : ${def.filters.length ? def.filters.join(" · ") : "aucun"}`);
  lines.push(`Périmètre : ${def.scope}`);
  lines.push(`Généré le ${frDateTime(def.generatedAt)} par ${def.requestedBy}`);
  return lines;
}

const truncationNote = (def) => `Export limité aux ${def.maxRows} premières lignes : affinez la période ou les filtres pour obtenir le reste.`;

// ── Excel ─────────────────────────────────────────────────────────────────

const solid = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } });

function sheetHeading(ws, def, subtitle, span) {
  ws.mergeCells(1, 1, 1, span);
  const title = ws.getCell(1, 1);
  title.value = subtitle ? `${def.title} — ${subtitle}` : def.title;
  title.font = { bold: true, size: 14, color: { argb: `FF${COLORS.navy}` } };
  let r = 2;
  for (const line of metaLines(def)) {
    ws.mergeCells(r, 1, r, span);
    ws.getCell(r, 1).value = line;
    ws.getCell(r, 1).font = { size: 10, color: { argb: `FF${COLORS.sub}` } };
    r += 1;
  }
  return r + 1; // une ligne vide
}

function headerRow(ws, rowIndex, headers) {
  const row = ws.getRow(rowIndex);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(COLORS.navy);
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: `FF${COLORS.border}` } } };
  });
  row.height = 22;
}

function addSummarySheet(wb, def) {
  const ws = wb.addWorksheet("Synthèse");
  let r = sheetHeading(ws, def, null, 3);
  headerRow(ws, r, ["Indicateur", "Valeur", "Unité"]);
  for (const k of def.kpis) {
    r += 1;
    ws.getCell(r, 1).value = k.label;
    const value = toNumber(k.value);
    ws.getCell(r, 2).value = value;
    if (value !== null) ws.getCell(r, 2).numFmt = Number.isInteger(value) ? INTEGER_FMT : NUMBER_FMT;
    ws.getCell(r, 3).value = k.unit || null;
  }
  if (!def.kpis.length) {
    r += 1;
    ws.getCell(r, 1).value = "Aucun indicateur pour ce rapport.";
  }
  r += 2;
  for (const note of def.notes) {
    ws.mergeCells(r, 1, r, 3);
    ws.getCell(r, 1).value = note;
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
    ws.getCell(r, 1).font = { italic: true, size: 10, color: { argb: `FF${COLORS.sub}` } };
    r += 1;
  }
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 18;
  ws.getColumn(3).width = 12;
}

function addDataSheet(wb, def, sheet) {
  const ws = wb.addWorksheet(sheet.name);
  const span = Math.max(sheet.columns.length, 1);
  let r = sheetHeading(ws, def, sheet.name, span);
  if (sheet.truncated) {
    ws.mergeCells(r, 1, r, span);
    ws.getCell(r, 1).value = truncationNote(def);
    ws.getCell(r, 1).font = { bold: true, color: { argb: "FFDC2626" } };
    r += 2;
  }
  const headerIndex = r;
  headerRow(ws, headerIndex, sheet.columns.map((c) => c.header));
  for (const row of sheet.rows) {
    r += 1;
    sheet.columns.forEach((column, i) => {
      const cell = ws.getCell(r, i + 1);
      cell.value = cellValue(column, row);
      if (column.type === "date") cell.numFmt = DATE_FMT;
      else if (column.type === "integer") cell.numFmt = INTEGER_FMT;
      else if (column.type === "number") cell.numFmt = NUMBER_FMT;
    });
    if ((r - headerIndex) % 2 === 0) ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => { cell.fill = solid(COLORS.band); });
  }
  if (!sheet.rows.length) {
    ws.getCell(headerIndex + 1, 1).value = "Aucune donnée pour ces critères.";
    ws.getCell(headerIndex + 1, 1).font = { italic: true, color: { argb: `FF${COLORS.sub}` } };
  }
  sheet.columns.forEach((column, i) => { ws.getColumn(i + 1).width = column.width || 18; });
  ws.views = [{ state: "frozen", ySplit: headerIndex }];
  ws.autoFilter = { from: { row: headerIndex, column: 1 }, to: { row: headerIndex, column: span } };
}

function buildWorkbook(def) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CRM CBI Tunisia";
  wb.created = def.generatedAt;
  addSummarySheet(wb, def);
  for (const sheet of def.sheets) addDataSheet(wb, def, sheet);
  return wb;
}

async function buildExcelBuffer(def) {
  return Buffer.from(await buildWorkbook(def).xlsx.writeBuffer());
}

// ── PDF ───────────────────────────────────────────────────────────────────

const hex = (c) => `#${c}`;
// Les polices standard de pdfkit n'ont pas l'espace fine insécable (U+202F) que
// produit toLocaleString("fr-FR") : remplacée par une espace simple.
const frNumber = (n, options) => n.toLocaleString("fr-FR", options).replace(/[\u202F\u00A0]/g, " ");

function pdfText(column, row) {
  const raw = row[column.key];
  if (raw === null || raw === undefined || raw === "") return "";
  if (column.type === "date") { const d = toDate(raw); return d ? frDate(d) : ""; }
  if (column.type === "integer") { const n = toNumber(raw); return n === null ? "" : frNumber(Math.round(n)); }
  if (column.type === "number") { const n = toNumber(raw); return n === null ? "" : frNumber(n, { maximumFractionDigits: 2 }); }
  return String(raw);
}

function pdfHeader(doc, def) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 60).fill(hex(COLORS.ink));
  doc.rect(0, 60, width, 3).fill(hex(COLORS.accent));
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(17).text("CBI TUNISIA", PAGE.margin, 16, { lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor("#CBD5E1").text("CRM", PAGE.margin, 38, { lineBreak: false });
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#FFFFFF").text(def.title, PAGE.margin, 18, { width: width - PAGE.margin * 2, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor("#CBD5E1").text(def.period, PAGE.margin, 38, { width: width - PAGE.margin * 2, align: "right", lineBreak: false });
  doc.y = 76;
}

function ensureSpace(doc, def, height) {
  if (doc.y + height <= doc.page.height - PAGE.margin - 16) return false;
  doc.addPage();
  pdfHeader(doc, def);
  return true;
}

function pdfKpis(doc, def) {
  if (!def.kpis.length) return;
  const usable = doc.page.width - PAGE.margin * 2;
  const perRow = Math.min(def.kpis.length, 6);
  const gap = 8;
  const w = (usable - gap * (perRow - 1)) / perRow;
  def.kpis.forEach((k, i) => {
    if (i % perRow === 0) { if (i) doc.y += 52; ensureSpace(doc, def, 52); }
    const x = PAGE.margin + (i % perRow) * (w + gap);
    const y = doc.y;
    doc.roundedRect(x, y, w, 44, 5).lineWidth(0.6).strokeColor(hex(COLORS.border)).stroke();
    doc.rect(x, y + 6, 2.5, 32).fill(hex(COLORS.accent));
    const value = toNumber(k.value);
    const text = value === null ? "—" : `${frNumber(value, { maximumFractionDigits: 2 })}${k.unit ? ` ${k.unit}` : ""}`;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(hex(COLORS.navy)).text(text, x + 9, y + 7, { width: w - 14, height: 16, lineBreak: false, ellipsis: true });
    doc.font("Helvetica").fontSize(7.5).fillColor(hex(COLORS.sub)).text(k.label, x + 9, y + 27, { width: w - 14, height: 12, lineBreak: false, ellipsis: true });
    doc.y = y;
  });
  doc.y += 56;
}

function pdfTable(doc, def, sheet) {
  ensureSpace(doc, def, 60);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(hex(COLORS.navy)).text(sheet.name, PAGE.margin, doc.y, { lineBreak: false });
  doc.y += 16;
  const usable = doc.page.width - PAGE.margin * 2;
  const total = sheet.columns.reduce((s, c) => s + (c.width || 18), 0) || 1;
  const widths = sheet.columns.map((c) => ((c.width || 18) / total) * usable);
  const rowHeight = 15;
  const HEADER_HEIGHT = 24;

  const drawHeader = () => {
    const y = doc.y;
    doc.rect(PAGE.margin, y, usable, HEADER_HEIGHT).fill(hex(COLORS.navy));
    let x = PAGE.margin;
    sheet.columns.forEach((c, i) => {
      // Deux lignes possibles : un intitulé long n'est pas coupé.
      doc.font("Helvetica-Bold").fontSize(7).fillColor("#FFFFFF").text(c.header, x + 3, y + 4, { width: widths[i] - 6, height: HEADER_HEIGHT - 6, ellipsis: true, lineGap: -0.5 });
      x += widths[i];
    });
    doc.y = y + HEADER_HEIGHT;
  };
  drawHeader();

  const rows = sheet.rows.slice(0, PDF_MAX_ROWS);
  rows.forEach((row, index) => {
    if (ensureSpace(doc, def, rowHeight)) drawHeader();
    const y = doc.y;
    if (index % 2 === 1) doc.rect(PAGE.margin, y, usable, rowHeight).fill(hex(COLORS.band));
    let x = PAGE.margin;
    sheet.columns.forEach((c, i) => {
      const numeric = c.type === "number" || c.type === "integer";
      doc.font("Helvetica").fontSize(7.5).fillColor(hex(COLORS.ink)).text(pdfText(c, row), x + 3, y + 4, {
        width: widths[i] - 6, height: 9, lineBreak: false, ellipsis: true, align: numeric ? "right" : "left",
      });
      x += widths[i];
    });
    doc.y = y + rowHeight;
  });

  doc.y += 6;
  const remarks = [];
  if (!sheet.rows.length) remarks.push("Aucune donnée pour ces critères.");
  if (sheet.rows.length > PDF_MAX_ROWS) remarks.push(`${sheet.rows.length - PDF_MAX_ROWS} ligne(s) supplémentaire(s) : consultez l'export Excel.`);
  if (sheet.truncated) remarks.push(truncationNote(def));
  for (const remark of remarks) {
    ensureSpace(doc, def, 12);
    doc.font("Helvetica-Oblique").fontSize(8).fillColor(hex(COLORS.sub)).text(remark, PAGE.margin, doc.y, { width: usable });
  }
  doc.y += 12;
}

function pdfFooters(doc, def) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Marge basse neutralisée le temps du pied de page : sinon pdfkit ouvre
    // une nouvelle page pour tout texte écrit sous la marge.
    doc.page.margins.bottom = 0;
    const y = doc.page.height - PAGE.margin - 4;
    doc.font("Helvetica").fontSize(7.5).fillColor(hex(COLORS.sub));
    doc.text(`CBI Tunisia - CRM - ${def.title} - généré le ${frDateTime(def.generatedAt)}`, PAGE.margin, y, { lineBreak: false });
    doc.text(`Page ${i - range.start + 1} / ${range.count}`, PAGE.margin, y, { width: doc.page.width - PAGE.margin * 2, align: "right", lineBreak: false });
  }
}

function buildPdfBuffer(def) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PAGE.margin, bufferPages: true, info: { Title: def.title, Author: "CRM CBI Tunisia" } });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    pdfHeader(doc, def);
    const usable = doc.page.width - PAGE.margin * 2;
    for (const line of metaLines(def).slice(1)) {
      doc.font("Helvetica").fontSize(8.5).fillColor(hex(COLORS.sub)).text(line, PAGE.margin, doc.y, { width: usable });
    }
    doc.y += 8;
    pdfKpis(doc, def);
    for (const sheet of def.sheets) pdfTable(doc, def, sheet);
    for (const note of def.notes) {
      ensureSpace(doc, def, 14);
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(hex(COLORS.sub)).text(note, PAGE.margin, doc.y, { width: usable });
    }
    pdfFooters(doc, def);
    doc.end();
  });
}

module.exports = { buildWorkbook, buildExcelBuffer, buildPdfBuffer, safeText, PDF_MAX_ROWS };
