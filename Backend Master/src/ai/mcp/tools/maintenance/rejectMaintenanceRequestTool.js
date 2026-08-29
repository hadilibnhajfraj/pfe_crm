"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");
const { MAINTENANCE_MANAGER_ROLES } = require("../../../../middleware/requireMaintenanceManager");
const { MAINTENANCE_MANAGER_EMAIL } = require("../../../../config/maintenanceManager");

function createRejectMaintenanceRequestTool() {
  return new ServiceBackedTool({
    name: "reject_maintenance_request",
    description: "Refuse une demande de maintenance en attente, avec motif.",
    inputSchema: Joi.object({
      id: Joi.string().guid({ version: "uuidv4" }).required(),
      reason: Joi.string().max(2000).required(),
    }),
    requiredRoles: MAINTENANCE_MANAGER_ROLES,
    allowedEmails: [MAINTENANCE_MANAGER_EMAIL],
    run: async (input, { actingUser }) => maintenanceService.rejectRequest(actingUser.id, input.id, input.reason),
  });
}

module.exports = { createRejectMaintenanceRequestTool };
