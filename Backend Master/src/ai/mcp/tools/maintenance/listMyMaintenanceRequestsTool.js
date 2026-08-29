"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");

function createListMyMaintenanceRequestsTool() {
  return new ServiceBackedTool({
    name: "list_my_maintenance_requests",
    description: "Liste les demandes de maintenance créées par l'utilisateur courant.",
    inputSchema: Joi.object({}),
    requiredRoles: [],
    run: async (_input, { actingUser }) => maintenanceService.getMyRequests(actingUser.id),
  });
}

module.exports = { createListMyMaintenanceRequestsTool };
