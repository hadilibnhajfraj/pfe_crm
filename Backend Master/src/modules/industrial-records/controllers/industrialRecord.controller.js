"use strict";

const svc = require("../services/industrialRecord.service");
const { toIndustrialRecordResponse, toIndustrialRecordList } = require("../dto/industrialRecord.dto");
const logger = require("../../../utils/logger");

function handle(res, err) {
  const status = err.status || 500;
  if (status >= 500) logger.error("IndustrialRecord error:", err);
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error",
  });
}

function actorFrom(req) {
  return { id: req.user.sub, role: req.user.role, email: req.user.email };
}

async function createRecord(req, res) {
  try {
    const data = await svc.createRecord(req.body, actorFrom(req));
    res.status(201).json({ success: true, data: toIndustrialRecordResponse(data) });
  } catch (err) {
    handle(res, err);
  }
}

// Fiches PROBAR déjà présentes pour la même machine, la même date et le même
// poste — lecture seule, appelée par l'application AVANT de créer une fiche.
async function findExistingFiches(req, res) {
  try {
    const { module, machine, poste, date } = req.query;
    if ((module && module !== "probar") || !machine || !["matin", "nuit"].includes(poste) || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
      return res.status(400).json({ success: false, message: "Paramètres attendus : module probar, machine, poste (matin | nuit), date facultative (AAAA-MM-JJ)." });
    }
    const data = await svc.findExistingFiches(actorFrom(req), { machine, poste, date });
    res.json({ success: true, data });
  } catch (err) {
    handle(res, err);
  }
}

async function listRecords(req, res) {
  try {
    const { module, machine, poste, page, pageSize } = req.query;
    const { data, total } = await svc.listRecords({ module, machine, poste, page, pageSize }, actorFrom(req));
    res.json({ success: true, count: total, data: toIndustrialRecordList(data) });
  } catch (err) {
    handle(res, err);
  }
}

async function getRecord(req, res) {
  try {
    const data = await svc.getRecordById(req.params.id, actorFrom(req));
    res.json({ success: true, data: toIndustrialRecordResponse(data) });
  } catch (err) {
    handle(res, err);
  }
}

async function updateRecord(req, res) {
  try {
    const data = await svc.updateRecord(req.params.id, req.body, actorFrom(req));
    res.json({ success: true, data: toIndustrialRecordResponse(data) });
  } catch (err) {
    handle(res, err);
  }
}

async function deleteRecord(req, res) {
  try {
    await svc.deleteRecord(req.params.id, actorFrom(req));
    res.json({ success: true });
  } catch (err) {
    handle(res, err);
  }
}

module.exports = { createRecord, listRecords, findExistingFiches, getRecord, updateRecord, deleteRecord };
