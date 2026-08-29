"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");
const { MAINTENANCE_MANAGER_ROLES } = require("../../../../middleware/requireMaintenanceManager");
const { MAINTENANCE_MANAGER_EMAIL } = require("../../../../config/maintenanceManager");

function createGetMaintenanceStatsTool() {
  return new ServiceBackedTool({
    name: "get_maintenance_stats",
    description: "Statistiques globales des demandes de maintenance (par statut, urgence critique, aujourd'hui/semaine).",
    inputSchema: Joi.object({}),
    requiredRoles: MAINTENANCE_MANAGER_ROLES,
    allowedEmails: [MAINTENANCE_MANAGER_EMAIL],
    run: async () => maintenanceService.getStats(),
  });
}

module.exports = { createGetMaintenanceStatsTool };
