"use strict";

// Export du module Production — classeur Excel multi-feuilles (exceljs) et
// rapport PDF (pdfkit), tous deux construits à partir des mêmes données que
// le dashboard (production.service.getExportData) : aucun chiffre n'est
// recalculé différemment ici.

const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const { frDate } = require("./productionPeriod");

const COLORS = Object.freeze({
  ink: "0F172A",
  sub: "64748B",
  border: "E2E8F0",
  band: "F1F5F9",
  promesh: "2563EB",
  probar: "F97316",
  waste: "EF4444",
  recuperable: "10B981",
});

const STATUS_LABELS = Object.freeze({ BROUILLON: "Brouillon", VALIDEE: "Validée", ARCHIVEE: "Archivée" });
const STATE_LABELS = Object.freeze({ EN_PRODUCTION: "En production", ACTIVE: "Active", INACTIVE: "Inactive" });
const POSTE_LABELS = Object.freeze({ matin: "Matin", nuit: "Nuit" });

function posteLabel(poste) {
  return POSTE_LABELS[poste] || "—";
}

function dateLabel(date) {
  if (!date) return "—";
  return date.length === 7 ? `${date.slice(5, 7)}/${date.slice(0, 4)}` : frDate(date);
}

function exportedAtLabel(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(now.getDate())}/${p(now.getMonth() + 1)}/${now.getFullYear()} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

function scopeTitle(data) {
  if (data.line === "promesh") return "PROMESH";
  if (data.line === "probar") return "PROBAR";
  return "PROMESH & PROBAR";
}

// Les lignes couvertes par l'export (une seule si l'export part d'une page
// PROMESH ou PROBAR).
function exportedLines(data) {
  return data.line ? [data.line] : ["promesh", "probar"];
}

// ══════════════════════════════════════════════════════════════════════════
// EXCEL
// ══════════════════════════════════════════════════════════════════════════

const NUM = "#,##0.00";
const INT = "#,##0";

function solid(argb) {
  return { type: "pattern", pattern: "solid", fgColor: { argb: `FF${argb}` } };
}

const THIN = { style: "thin", color: { argb: `FF${COLORS.border}` } };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function sheetHeader(ws, title, data, columnCount, accent = COLORS.ink) {
  ws.mergeCells(1, 1, 1, columnCount);
  const t = ws.getCell(1, 1);
  t.value = `CBI Tunisia — ${title}`;
  t.font = { name: "Calibri", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = solid(accent);
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, columnCount);
  const m = ws.getCell(2, 1);
  m.value = `Période : ${data.dashboard.period.label} (${frDate(data.dashboard.period.from)} → ${frDate(data.dashboard.period.to)})   ·   Exporté le ${exportedAtLabel()}`;
  m.font = { name: "Calibri", size: 10, color: { argb: `FF${COLORS.sub}` } };
  m.fill = solid(COLORS.band);
  m.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 20;
  return 4; // première ligne libre
}

function tableHeader(ws, rowIndex, headers, accent = COLORS.ink) {
  const row = ws.getRow(rowIndex);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = solid(accent);
    cell.border = BOX;
    cell.alignment = { vertical: "middle", horizontal: i === 0 ? "left" : "center", wrapText: true };
  });
  row.height = 22;
  return rowIndex + 1;
}

function tableRow(ws, rowIndex, values, formats = [], style = {}) {
  const row = ws.getRow(rowIndex);
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = v === undefined ? null : v;
    cell.border = BOX;
    cell.font = { name: "Calibri", size: 10, bold: !!style.bold, color: { argb: `FF${COLORS.ink}` } };
    if (style.fill) cell.fill = solid(style.fill);
    if (formats[i] && typeof v === "number") cell.numFmt = formats[i];
    cell.alignment = { vertical: "middle", horizontal: typeof v === "number" ? "right" : "left" };
  });
  return rowIndex + 1;
}

function setWidths(ws, widths) {
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

const PRODUCTION_HEADERS = ["Date", "Référence", "Ligne", "Machine", "Poste", "Utilisateur", "Quantité (m²)", "Déchets du poste (kg)", "Statut"];
const PRODUCTION_WIDTHS = [13, 26, 12, 14, 10, 28, 16, 20, 13];
const PRODUCTION_FORMATS = [null, null, null, null, null, null, NUM, NUM, null];

function productionValues(r) {
  return [
    dateLabel(r.date),
    r.reference || "—",
    r.lineLabel,
    r.machine ? r.machine.code : "—",
    posteLabel(r.poste),
    r.user || "—",
    r.quantity,
    r.wasteKg == null ? "—" : r.wasteKg,
    STATUS_LABELS[r.status] || r.status,
  ];
}

function summaryRows(data) {
  const d = data.dashboard;
  const rows = exportedLines(data).map((line) => [
    d[line === "promesh" ? "promesh" : "probar"],
    line === "promesh" ? "PROMESH" : "PROBAR",
  ]);
  return rows.map(([s, label]) => [label, s.fiches, s.quantity, s.wasteKg, s.recuperableKg, s.wasteRate == null ? "—" : s.wasteRate, s.brouillons, s.validees]);
}

function totalSummaryRow(data) {
  const d = data.dashboard;
  const lines = exportedLines(data).map((l) => d[l]);
  const sum = (k) => lines.reduce((s, x) => s + x[k], 0);
  return ["TOTAL", d.production.fiches, d.production.quantity, d.waste.kg, d.waste.recuperableKg, d.waste.rate == null ? "—" : d.waste.rate, sum("brouillons"), sum("validees")];
}

function addResumeSheet(wb, data) {
  const ws = wb.addWorksheet("Résumé", { views: [{ showGridLines: false }] });
  setWidths(ws, [22, 12, 18, 16, 22, 22, 13, 13]);
  let r = sheetHeader(ws, `Rapport de production ${scopeTitle(data)}`, data, 8);

  r = tableHeader(ws, r, ["Ligne", "Fiches", "Quantité (m²)", "Déchets (kg)", "Déchet + produit fini (kg)", "Taux de déchets (kg/100 m²)", "Brouillons", "Validées"]);
  const formats = [null, INT, NUM, NUM, NUM, NUM, INT, INT];
  for (const values of summaryRows(data)) r = tableRow(ws, r, values, formats);
  r = tableRow(ws, r, totalSummaryRow(data), formats, { bold: true, fill: COLORS.band });

  r += 1;
  r = tableHeader(ws, r, ["Machines", "Valeur"]);
  const m = data.dashboard.machines;
  r = tableRow(ws, r, ["Machines actives (référentiel)", m.active], [null, INT]);
  r = tableRow(ws, r, ["Machines au référentiel", m.total], [null, INT]);
  r = tableRow(ws, r, ["Machines avec production sur la période", m.withProduction], [null, INT]);
  tableRow(ws, r, ["Productions aujourd'hui", m.productionsToday], [null, INT]);
}

function addProductionsSheet(wb, data) {
  const ws = wb.addWorksheet("Productions", { views: [{ state: "frozen", ySplit: 4, showGridLines: false }] });
  setWidths(ws, PRODUCTION_WIDTHS);
  let r = sheetHeader(ws, "Productions", data, PRODUCTION_HEADERS.length);
  r = tableHeader(ws, r, PRODUCTION_HEADERS);
  ws.autoFilter = { from: { row: r - 1, column: 1 }, to: { row: r - 1, column: PRODUCTION_HEADERS.length } };
  for (const row of data.rows) r = tableRow(ws, r, productionValues(row), PRODUCTION_FORMATS);
  tableRow(
    ws,
    r,
    ["TOTAL", `${data.rows.length} fiche(s)`, "", "", "", "", data.dashboard.production.quantity, data.dashboard.waste.kg, ""],
    PRODUCTION_FORMATS,
    { bold: true, fill: COLORS.band }
  );
}

// Feuille d'une ligne : fiches regroupées par machine, sous-total par machine
// puis total de la ligne.
function addLineSheet(wb, data, line) {
  const label = line === "promesh" ? "PROMESH" : "PROBAR";
  const accent = line === "promesh" ? COLORS.promesh : COLORS.probar;
  const summary = data.dashboard[line];
  const ws = wb.addWorksheet(label, { views: [{ showGridLines: false }] });
  setWidths(ws, PRODUCTION_WIDTHS);
  let r = sheetHeader(ws, label, data, PRODUCTION_HEADERS.length, accent);

  r = tableHeader(ws, r, ["Machine", "Fiches", "Quantité (m²)", "Déchets (kg)", "Taux (kg/100 m²)", "Dernière production", "Statut"], accent);
  for (const m of summary.machines) {
    r = tableRow(
      ws,
      r,
      [m.code, m.fiches, m.quantity, m.wasteKg, m.wasteRate == null ? "—" : m.wasteRate, dateLabel(m.lastProduction), STATE_LABELS[m.state] || m.state],
      [null, INT, NUM, NUM, NUM, null, null]
    );
  }
  r = tableRow(
    ws,
    r,
    ["TOTAL", summary.fiches, summary.quantity, summary.wasteKg, summary.wasteRate == null ? "—" : summary.wasteRate, "", ""],
    [null, INT, NUM, NUM, NUM, null, null],
    { bold: true, fill: COLORS.band }
  );

  r += 1;
  r = tableHeader(ws, r, PRODUCTION_HEADERS, accent);
  const rows = data.rows.filter((x) => x.line === line);
  const groups = new Map();
  for (const row of rows) {
    const key = row.machine ? row.machine.code : "Sans machine";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  for (const [code, group] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const row of group) r = tableRow(ws, r, productionValues(row), PRODUCTION_FORMATS);
    const machine = summary.machines.find((m) => m.code === code);
    r = tableRow(
      ws,
      r,
      [`Sous-total ${code}`, `${group.length} fiche(s)`, "", "", "", "", group.reduce((s, x) => s + x.quantity, 0), machine ? machine.wasteKg : "—", ""],
      PRODUCTION_FORMATS,
      { bold: true, fill: COLORS.band }
    );
  }
  tableRow(ws, r, [`TOTAL ${label}`, `${rows.length} fiche(s)`, "", "", "", "", summary.quantity, summary.wasteKg, ""], PRODUCTION_FORMATS, {
    bold: true,
    fill: COLORS.band,
  });
}

function addWasteSheet(wb, data) {
  const ws = wb.addWorksheet("Déchets", { views: [{ showGridLines: false }] });
  setWidths(ws, [13, 12, 14, 10, 16, 24]);
  let r = sheetHeader(ws, "Déchets (fiches Récupérables)", data, 6, COLORS.waste);
  r = tableHeader(ws, r, ["Date", "Ligne", "Machine", "Poste", "Déchets (kg)", "Déchet + produit fini (kg)"], COLORS.waste);
  const formats = [null, null, null, null, NUM, NUM];
  const sorted = [...data.waste].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  for (const w of sorted) {
    r = tableRow(ws, r, [dateLabel(w.date), w.lineLabel, w.machine ? w.machine.code : "—", posteLabel(w.poste), w.wasteKg, w.recuperableKg], formats);
  }
  r = tableRow(ws, r, ["TOTAL", "", "", "", data.dashboard.waste.kg, data.dashboard.waste.recuperableKg], formats, { bold: true, fill: COLORS.band });

  r += 1;
  const byDate = data.dashboard.charts.granularity === "month" ? "Mois" : "Jour";
  r = tableHeader(ws, r, [byDate, "PROMESH (kg)", "PROBAR (kg)", "Total (kg)"], COLORS.waste);
  for (const p of data.dashboard.charts.waste) {
    r = tableRow(ws, r, [dateLabel(p.date), p.promesh, p.probar, p.total], [null, NUM, NUM, NUM]);
  }
}

function addKpiSheet(wb, data) {
  const d = data.dashboard;
  const ws = wb.addWorksheet("KPI", { views: [{ showGridLines: false }] });
  setWidths(ws, [44, 20, 16]);
  let r = sheetHeader(ws, "Indicateurs clés", data, 3);
  r = tableHeader(ws, r, ["Indicateur", "Valeur", "Unité"]);
  const formats = [null, NUM, null];
  const rate = (v) => (v == null ? "—" : v);
  for (const line of exportedLines(data)) {
    const s = d[line];
    const label = line === "promesh" ? "PROMESH" : "PROBAR";
    r = tableRow(ws, r, [`Fiches ${label}`, s.fiches, "fiches"], [null, INT, null]);
    r = tableRow(ws, r, [`Quantité produite ${label}`, s.quantity, "m²"], formats);
    r = tableRow(ws, r, [`Déchets ${label}`, s.wasteKg, "kg"], formats);
    r = tableRow(ws, r, [`Taux de déchets ${label}`, rate(s.wasteRate), "kg / 100 m²"], formats);
  }
  r = tableRow(ws, r, ["Production totale", d.production.quantity, "m²"], formats, { bold: true, fill: COLORS.band });
  r = tableRow(ws, r, ["Déchets totaux", d.waste.kg, "kg"], formats, { bold: true, fill: COLORS.band });
  r = tableRow(ws, r, ["Taux de déchets global", rate(d.waste.rate), "kg / 100 m²"], formats, { bold: true, fill: COLORS.band });
  r = tableRow(ws, r, ["Machines actives", d.machines.active, "machines"], [null, INT, null]);
  r = tableRow(ws, r, ["Productions aujourd'hui", d.machines.productionsToday, "fiches"], [null, INT, null]);

  r += 1;
  const byDate = d.charts.granularity === "month" ? "Mois" : "Jour";
  r = tableHeader(ws, r, [`Production par ${byDate.toLowerCase()}`, "PROMESH (m²)", "PROBAR (m²)"]);
  for (const p of d.charts.production) r = tableRow(ws, r, [dateLabel(p.date), p.promesh, p.probar], [null, NUM, NUM]);
}

async function buildWorkbook(data) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CBI Tunisia";
  wb.created = new Date();
  addResumeSheet(wb, data);
  addProductionsSheet(wb, data);
  for (const line of exportedLines(data)) addLineSheet(wb, data, line);
  addWasteSheet(wb, data);
  addKpiSheet(wb, data);
  return wb;
}

async function buildExcelBuffer(data) {
  const wb = await buildWorkbook(data);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ══════════════════════════════════════════════════════════════════════════
// PDF
// ══════════════════════════════════════════════════════════════════════════

const PAGE = { margin: 36 };

// Espace insécable fine (toLocaleString fr-FR) absente des polices PDF
// standard : séparateur de milliers = espace simple.
function fmt(value, decimals = 2) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const [int, dec] = Number(value).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec ? `${grouped},${dec}` : grouped;
}

function hex(c) {
  return `#${c}`;
}

function pdfHeader(doc, data) {
  const width = doc.page.width;
  doc.rect(0, 0, width, 64).fill(hex(COLORS.ink));
  // Liseré aux couleurs des deux lignes de production.
  doc.rect(0, 64, width / 2, 3).fill(hex(COLORS.promesh));
  doc.rect(width / 2, 64, width / 2, 3).fill(hex(COLORS.probar));

  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(17).text("CBI TUNISIA", PAGE.margin, 18);
  doc.font("Helvetica").fontSize(9).fillColor("#CBD5E1").text("PROBAR  ·  PROMESH", PAGE.margin, 40);

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#FFFFFF").text(`Rapport de production ${scopeTitle(data)}`, PAGE.margin, 20, {
    width: width - PAGE.margin * 2,
    align: "right",
  });
  const p = data.dashboard.period;
  doc.font("Helvetica").fontSize(9).fillColor("#CBD5E1").text(`${p.label}  (${frDate(p.from)} - ${frDate(p.to)})`, PAGE.margin, 38, {
    width: width - PAGE.margin * 2,
    align: "right",
  });
  doc.y = 84;
}

function sectionTitle(doc, title, color = COLORS.ink) {
  ensureSpace(doc, 40);
  const y = doc.y + 6;
  doc.rect(PAGE.margin, y, 3, 13).fill(hex(color));
  doc.fillColor(hex(COLORS.ink)).font("Helvetica-Bold").fontSize(11).text(title, PAGE.margin + 9, y + 1);
  doc.y = y + 22;
}

function ensureSpace(doc, height, onNewPage) {
  if (doc.y + height > doc.page.height - PAGE.margin - 18) {
    doc.addPage();
    doc.y = PAGE.margin;
    if (onNewPage) onNewPage();
  }
}

function kpiRow(doc, cards) {
  const gap = 10;
  const width = (doc.page.width - PAGE.margin * 2 - gap * (cards.length - 1)) / cards.length;
  const y = doc.y;
  cards.forEach((card, i) => {
    const x = PAGE.margin + i * (width + gap);
    doc.roundedRect(x, y, width, 50, 6).lineWidth(0.8).strokeColor(hex(COLORS.border)).stroke();
    doc.rect(x, y + 8, 3, 34).fill(hex(card.color));
    doc.fillColor(hex(COLORS.sub)).font("Helvetica").fontSize(8).text(card.label.toUpperCase(), x + 12, y + 9, { width: width - 18 });
    doc.fillColor(hex(COLORS.ink)).font("Helvetica-Bold").fontSize(14).text(card.value, x + 12, y + 23, { width: width - 18 });
  });
  doc.y = y + 60;
}

// Tableau paginé : l'en-tête est répété en haut de chaque nouvelle page.
function pdfTable(doc, columns, rows, { accent = COLORS.ink, footer = null } = {}) {
  const totalWeight = columns.reduce((s, c) => s + c.weight, 0);
  const usable = doc.page.width - PAGE.margin * 2;
  const widths = columns.map((c) => (c.weight / totalWeight) * usable);
  const rowHeight = 17;

  const drawCells = (values, y, { bold = false, color = COLORS.ink, fill = null, header = false } = {}) => {
    if (fill) doc.rect(PAGE.margin, y, usable, rowHeight).fill(hex(fill));
    let x = PAGE.margin;
    values.forEach((value, i) => {
      doc
        .fillColor(header ? "#FFFFFF" : hex(color))
        .font(bold || header ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8)
        .text(String(value == null ? "—" : value), x + 5, y + 5, {
          width: widths[i] - 10,
          align: columns[i].align || "left",
          lineBreak: false,
          ellipsis: true,
        });
      x += widths[i];
    });
    doc.moveTo(PAGE.margin, y + rowHeight).lineTo(PAGE.margin + usable, y + rowHeight).lineWidth(0.5).strokeColor(hex(COLORS.border)).stroke();
  };

  const drawHeader = () => {
    drawCells(columns.map((c) => c.label), doc.y, { header: true, fill: accent });
    doc.y += rowHeight;
  };

  ensureSpace(doc, rowHeight * 3);
  drawHeader();
  if (!rows.length) {
    drawCells(["Aucune donnée sur la période", ...columns.slice(1).map(() => "")], doc.y, { color: COLORS.sub });
    doc.y += rowHeight;
  }
  rows.forEach((values, i) => {
    ensureSpace(doc, rowHeight, drawHeader);
    drawCells(values, doc.y, { fill: i % 2 === 1 ? "F8FAFC" : null });
    doc.y += rowHeight;
  });
  if (footer) {
    ensureSpace(doc, rowHeight, drawHeader);
    drawCells(footer, doc.y, { bold: true, fill: COLORS.band });
    doc.y += rowHeight;
  }
  doc.y += 8;
}

function pdfFooters(doc) {
  const range = doc.bufferedPageRange();
  const exported = exportedAtLabel();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = doc.page.height - PAGE.margin - 4;
    doc.font("Helvetica").fontSize(7.5).fillColor(hex(COLORS.sub));
    // lineBreak:false — écrire sous la marge basse ne doit jamais créer de page.
    doc.text(`CBI Tunisia - Module Production - Exporté le ${exported}`, PAGE.margin, y, { lineBreak: false });
    doc.text(`Page ${i - range.start + 1} / ${range.count}`, PAGE.margin, y, {
      width: doc.page.width - PAGE.margin * 2,
      align: "right",
      lineBreak: false,
    });
  }
}

function buildPdf(data) {
  const d = data.dashboard;
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: PAGE.margin, bufferPages: true });
  pdfHeader(doc, data);

  sectionTitle(doc, "Indicateurs clés");
  kpiRow(doc, [
    { label: "Fiches", value: fmt(d.production.fiches, 0), color: COLORS.ink },
    { label: "Production totale", value: `${fmt(d.production.quantity)} m²`, color: COLORS.promesh },
    { label: "Déchets", value: `${fmt(d.waste.kg)} kg`, color: COLORS.waste },
    { label: "Taux de déchets", value: d.waste.rate == null ? "—" : `${fmt(d.waste.rate)} kg/100 m²`, color: COLORS.probar },
    { label: "Machines actives", value: `${d.machines.active} / ${d.machines.total}`, color: COLORS.recuperable },
  ]);

  sectionTitle(doc, "Synthèse par ligne");
  pdfTable(
    doc,
    [
      { label: "Ligne", weight: 2 },
      { label: "Fiches", weight: 1, align: "right" },
      { label: "Quantité (m²)", weight: 2, align: "right" },
      { label: "Déchets (kg)", weight: 2, align: "right" },
      { label: "Taux (kg/100 m²)", weight: 2, align: "right" },
      { label: "Brouillons", weight: 1.3, align: "right" },
      { label: "Validées", weight: 1.3, align: "right" },
    ],
    exportedLines(data).map((line) => {
      const s = d[line];
      return [line === "promesh" ? "PROMESH" : "PROBAR", fmt(s.fiches, 0), fmt(s.quantity), fmt(s.wasteKg), fmt(s.wasteRate), fmt(s.brouillons, 0), fmt(s.validees, 0)];
    }),
    { footer: ["TOTAL", fmt(d.production.fiches, 0), fmt(d.production.quantity), fmt(d.waste.kg), fmt(d.waste.rate), "", ""] }
  );

  for (const line of exportedLines(data)) {
    const label = line === "promesh" ? "PROMESH" : "PROBAR";
    const accent = line === "promesh" ? COLORS.promesh : COLORS.probar;
    const s = d[line];
    sectionTitle(doc, `${label} — production par machine`, accent);
    pdfTable(
      doc,
      [
        { label: "Machine", weight: 2 },
        { label: "Fiches", weight: 1, align: "right" },
        { label: "Quantité (m²)", weight: 2, align: "right" },
        { label: "Déchets (kg)", weight: 2, align: "right" },
        { label: "Dernière production", weight: 2 },
        { label: "Statut", weight: 2 },
      ],
      s.machines.map((m) => [m.code, fmt(m.fiches, 0), fmt(m.quantity), fmt(m.wasteKg), dateLabel(m.lastProduction), STATE_LABELS[m.state] || m.state]),
      { accent, footer: [`TOTAL ${label}`, fmt(s.fiches, 0), fmt(s.quantity), fmt(s.wasteKg), "", ""] }
    );
  }

  sectionTitle(doc, `Productions (${data.rows.length})`);
  pdfTable(
    doc,
    [
      { label: "Date", weight: 1.3 },
      { label: "Référence", weight: 2.6 },
      { label: "Ligne", weight: 1.2 },
      { label: "Machine", weight: 1.5 },
      { label: "Poste", weight: 1 },
      { label: "Utilisateur", weight: 2.8 },
      { label: "Quantité (m²)", weight: 1.6, align: "right" },
      { label: "Déchets (kg)", weight: 1.5, align: "right" },
      { label: "Statut", weight: 1.2 },
    ],
    data.rows.map((r) => [
      dateLabel(r.date),
      r.reference || "—",
      r.lineLabel,
      r.machine ? r.machine.code : "—",
      posteLabel(r.poste),
      r.user || "—",
      fmt(r.quantity),
      r.wasteKg == null ? "—" : fmt(r.wasteKg),
      STATUS_LABELS[r.status] || r.status,
    ]),
    { footer: ["TOTAL", `${data.rows.length} fiche(s)`, "", "", "", "", fmt(d.production.quantity), fmt(d.waste.kg), ""] }
  );

  pdfFooters(doc);
  doc.end();
  return doc;
}

function fileBaseName(data) {
  const p = data.dashboard.period;
  const scope = data.line ? data.line : "production";
  return `${scope}_${p.from}_${p.to}`;
}

module.exports = { buildWorkbook, buildExcelBuffer, buildPdf, fileBaseName };
