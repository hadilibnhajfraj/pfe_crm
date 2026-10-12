"use strict";

const Joi = require("joi");
const data = require("../services/reportData.service");
const renderer = require("../services/reportRenderer.service");

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const YMD = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).custom((value, helpers) => {
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? helpers.error("any.invalid") : value;
});

// Tout paramètre inconnu est refusé : aucun filtre « caché » ne peut être tenté.
const querySchema = Joi.object({
  format: Joi.string().valid("xlsx", "pdf").required(),
  from: YMD,
  to: YMD,
  status: Joi.string().trim().min(1).max(100),
  ownerId: Joi.string().guid({ version: ["uuidv1", "uuidv4", "uuidv5"] }),
  period: Joi.string().valid("today", "week", "month", "year", "custom"),
  line: Joi.string().valid("promesh", "probar"),
}).custom((value, helpers) => (value.from && value.to && value.from > value.to ? helpers.error("any.invalid") : value));

function fail(res, err) {
  const status = err.status && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error("Report error:", err);
  return res.status(status).json({ success: false, message: status === 500 ? "Le rapport n'a pas pu être généré." : err.message });
}

function stamp(now) {
  const p = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

function send(res, buffer, format, name, meta = {}) {
  res.setHeader("Content-Type", format === "xlsx" ? XLSX_MIME : "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${name}.${format}"`);
  res.setHeader("Cache-Control", "no-store");
  if (meta.rows !== undefined) res.setHeader("X-Report-Rows", String(meta.rows));
  if (meta.truncated !== undefined) res.setHeader("X-Report-Truncated", meta.truncated ? "true" : "false");
  return res.send(buffer);
}

// GET /reports — rapports disponibles pour le profil (relu en base).
async function listReports(req, res) {
  try {
    const user = await data.loadUser(req.user.sub);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ success: true, data: { reports: data.catalogFor(user), maxRows: data.MAX_ROWS } });
  } catch (err) {
    return fail(res, err);
  }
}

// GET /reports/:type?format=xlsx|pdf&from=&to=&status=&ownerId=&period=&line=
async function exportReport(req, res) {
  try {
    const { error, value: filters } = querySchema.validate(req.query, { abortEarly: true });
    if (error) return res.status(400).json({ success: false, message: "Paramètres de rapport invalides." });

    const user = await data.loadUser(req.user.sub);
    const type = req.params.type;
    const { format, ...criteria } = filters;
    data.assertAllowed(type, user, criteria);
    const now = new Date();

    if (type === "production") {
      // Délégué aux services existants du module Production (périmètre et mise en forme inchangés).
      const productionService = require("../../production/services/production.service");
      const exporter = require("../../production/services/productionExport.service");
      const exportData = await productionService.getExportData({ id: user.id, role: user.role, email: user.email }, criteria);
      const name = exporter.fileBaseName(exportData);
      if (format === "xlsx") return send(res, Buffer.from(await exporter.buildExcelBuffer(exportData)), format, name);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${name}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      return exporter.buildPdf(exportData).pipe(res);
    }

    const def = await data.buildReport(type, user, criteria, now);
    const buffer = format === "xlsx" ? await renderer.buildExcelBuffer(def) : await renderer.buildPdfBuffer(def);
    return send(res, buffer, format, `rapport-${type}-${stamp(now)}`, {
      rows: def.sheets.reduce((s, sheet) => s + sheet.rows.length, 0),
      truncated: def.sheets.some((sheet) => sheet.truncated),
    });
  } catch (err) {
    return fail(res, err);
  }
}

module.exports = { listReports, exportReport };
