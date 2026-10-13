"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");

// getById() vérifie déjà en interne (manager OU propriétaire) — signature
// positionnelle particulière (userId, userRole, requestId, userEmail),
// reproduite telle quelle.
function createGetMaintenanceRequestTool() {
  return new ServiceBackedTool({
    name: "get_maintenance_request",
    description: "Récupère une demande de maintenance par identifiant.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) =>
      maintenanceService.getById(actingUser.id, actingUser.role, input.id, actingUser.email),
  });
}

module.exports = { createGetMaintenanceRequestTool };
