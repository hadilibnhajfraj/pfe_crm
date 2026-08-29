"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");
const { MAINTENANCE_MANAGER_ROLES } = require("../../../../middleware/requireMaintenanceManager");
const { MAINTENANCE_MANAGER_EMAIL } = require("../../../../config/maintenanceManager");

function createListAllMaintenanceRequestsTool() {
  return new ServiceBackedTool({
    name: "list_all_maintenance_requests",
    description: "Liste/filtre toutes les demandes de maintenance (statut, urgence, recherche texte).",
    inputSchema: Joi.object({
      statut: Joi.string().valid("en_attente", "acceptee", "en_cours", "terminee", "refusee").optional(),
      urgence: Joi.string().valid("faible", "moyenne", "critique").optional(),
      search: Joi.string().max(255).optional(),
    }),
    requiredRoles: MAINTENANCE_MANAGER_ROLES,
    allowedEmails: [MAINTENANCE_MANAGER_EMAIL],
    run: async (input) => maintenanceService.getAllRequests(input),
  });
}

module.exports = { createListAllMaintenanceRequestsTool };
