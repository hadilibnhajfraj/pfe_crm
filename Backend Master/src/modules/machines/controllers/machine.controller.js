"use strict";

const svc = require("../services/machine.service");
const { toMachineResponse, toMachineList } = require("../dto/machine.dto");
const logger = require("../../../utils/logger");

function handle(res, err) {
  const status = err.status || 500;
  if (status >= 500) logger.error("Machine error:", err);
  res.status(status).json({
    success: false,
    message: status >= 500 ? "Internal server error" : err.message,
  });
}

async function listMachines(req, res) {
  try {
    const data = await svc.listMachines(req.validatedQuery || {});
    res.json({ success: true, count: data.length, data: toMachineList(data) });
  } catch (err) {
    handle(res, err);
  }
}

async function getMachine(req, res) {
  try {
    const { machine, fiches } = await svc.getMachine(req.params.id);
    res.json({ success: true, data: toMachineResponse(machine, fiches) });
  } catch (err) {
    handle(res, err);
  }
}

async function createMachine(req, res) {
  try {
    const data = await svc.createMachine(req.body);
    res.status(201).json({ success: true, data: toMachineResponse(data) });
  } catch (err) {
    handle(res, err);
  }
}

async function updateMachine(req, res) {
  try {
    const data = await svc.updateMachine(req.params.id, req.body);
    res.json({ success: true, data: toMachineResponse(data) });
  } catch (err) {
    handle(res, err);
  }
}

async function setStatut(req, res) {
  try {
    const data = await svc.setStatut(req.params.id, req.body.statut);
    res.json({ success: true, data: toMachineResponse(data) });
  } catch (err) {
    handle(res, err);
  }
}

module.exports = { listMachines, getMachine, createMachine, updateMachine, setStatut };
