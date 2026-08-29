"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");

function createGetMaintenanceHistoryTool() {
  return new ServiceBackedTool({
    name: "get_maintenance_history",
    description: "Historique d'activité d'une demande de maintenance.",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) =>
      maintenanceService.getHistory(actingUser.id, actingUser.role, input.id, actingUser.email),
  });
}

module.exports = { createGetMaintenanceHistoryTool };
