"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");
const { MAINTENANCE_MANAGER_ROLES } = require("../../../../middleware/requireMaintenanceManager");
const { MAINTENANCE_MANAGER_EMAIL } = require("../../../../config/maintenanceManager");

function createDeleteMaintenanceRequestTool() {
  return new ServiceBackedTool({
    name: "delete_maintenance_request",
    description: "Supprime définitivement une demande de maintenance.",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: MAINTENANCE_MANAGER_ROLES,
    allowedEmails: [MAINTENANCE_MANAGER_EMAIL],
    run: async (input) => maintenanceService.deleteRequest(input.id),
  });
}

module.exports = { createDeleteMaintenanceRequestTool };
