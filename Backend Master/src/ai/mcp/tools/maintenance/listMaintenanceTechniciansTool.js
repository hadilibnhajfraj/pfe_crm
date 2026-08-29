"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");
const { MAINTENANCE_MANAGER_ROLES } = require("../../../../middleware/requireMaintenanceManager");
const { MAINTENANCE_MANAGER_EMAIL } = require("../../../../config/maintenanceManager");

function createListMaintenanceTechniciansTool() {
  return new ServiceBackedTool({
    name: "list_maintenance_technicians",
    description: "Liste les utilisateurs actifs candidats comme technicien de maintenance.",
    inputSchema: Joi.object({}),
    requiredRoles: MAINTENANCE_MANAGER_ROLES,
    allowedEmails: [MAINTENANCE_MANAGER_EMAIL],
    run: async () => maintenanceService.getTechnicians(),
  });
}

module.exports = { createListMaintenanceTechniciansTool };
