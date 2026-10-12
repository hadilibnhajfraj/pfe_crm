"use strict";

const svc = require("../services/production.service");
const exporter = require("../services/productionExport.service");
const logger = require("../../../utils/logger");

function handle(res, err) {
  const status = err.status || 500;
  if (status >= 500) logger.error("Production error:", err);
  res.status(status).json({
    success: false,
    message: status >= 500 ? "Internal server error" : err.message,
  });
}

function actorFrom(req) {
  return { id: req.user.sub, role: req.user.role, email: req.user.email };
}

async function getDashboard(req, res) {
  try {
    const { period, from, to, refresh } = req.query;
    const data = await svc.getDashboard(actorFrom(req), { period, from, to, refresh });
    res.json({ success: true, data });
  } catch (err) {
    handle(res, err);
  }
}

async function listFiches(req, res) {
  try {
    const { line, period, from, to, machine, poste, user, status, search, page, pageSize } = req.query;
    const result = await svc.listFiches(actorFrom(req), { line, period, from, to, machine, poste, user, status, search, page, pageSize });
    res.json({ success: true, ...result });
  } catch (err) {
    handle(res, err);
  }
}

async function getFiche(req, res) {
  try {
    const data = await svc.getFiche(actorFrom(req), req.params.line, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    handle(res, err);
  }
}

async function exportProduction(req, res) {
  try {
    const { format, line, period, from, to, machine, poste, user, status, search } = req.query;
    if (!["xlsx", "pdf"].includes(format)) {
      return res.status(400).json({ success: false, message: "Format d'export invalide (xlsx ou pdf)." });
    }
    const data = await svc.getExportData(actorFrom(req), { line, period, from, to, machine, poste, user, status, search });
    const name = exporter.fileBaseName(data);

    if (format === "xlsx") {
      const buffer = await exporter.buildExcelBuffer(data);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename="${name}.xlsx"`);
      return res.send(buffer);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${name}.pdf"`);
    return exporter.buildPdf(data).pipe(res);
  } catch (err) {
    return handle(res, err);
  }
}

module.exports = { getDashboard, listFiches, getFiche, exportProduction };
