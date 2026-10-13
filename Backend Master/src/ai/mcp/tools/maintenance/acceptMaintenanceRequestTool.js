"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");
const { MAINTENANCE_MANAGER_ROLES } = require("../../../../middleware/requireMaintenanceManager");
const { MAINTENANCE_MANAGER_EMAIL } = require("../../../../config/maintenanceManager");

function createAcceptMaintenanceRequestTool() {
  return new ServiceBackedTool({
    name: "accept_maintenance_request",
    description: "Accepte une demande de maintenance en attente.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: MAINTENANCE_MANAGER_ROLES,
    allowedEmails: [MAINTENANCE_MANAGER_EMAIL],
    run: async (input, { actingUser }) => maintenanceService.acceptRequest(actingUser.id, input.id),
  });
}

module.exports = { createAcceptMaintenanceRequestTool };
