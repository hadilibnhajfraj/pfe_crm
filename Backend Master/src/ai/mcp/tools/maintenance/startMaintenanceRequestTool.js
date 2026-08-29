"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");
const { MAINTENANCE_MANAGER_ROLES } = require("../../../../middleware/requireMaintenanceManager");
const { MAINTENANCE_MANAGER_EMAIL } = require("../../../../config/maintenanceManager");

function createStartMaintenanceRequestTool() {
  return new ServiceBackedTool({
    name: "start_maintenance_request",
    description: "Démarre l'intervention sur une demande de maintenance acceptée (avec technicien affecté).",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: MAINTENANCE_MANAGER_ROLES,
    allowedEmails: [MAINTENANCE_MANAGER_EMAIL],
    run: async (input, { actingUser }) => maintenanceService.startRequest(actingUser.id, input.id),
  });
}

module.exports = { createStartMaintenanceRequestTool };
