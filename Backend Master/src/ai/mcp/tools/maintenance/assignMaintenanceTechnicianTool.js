"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");
const { MAINTENANCE_MANAGER_ROLES } = require("../../../../middleware/requireMaintenanceManager");
const { MAINTENANCE_MANAGER_EMAIL } = require("../../../../config/maintenanceManager");

function createAssignMaintenanceTechnicianTool() {
  return new ServiceBackedTool({
    name: "assign_maintenance_technician",
    description: "Affecte un technicien à une demande de maintenance (ne change pas le statut).",
    inputSchema: Joi.object({
      id: Joi.string().guid({ version: "uuidv4" }).required(),
      technicianId: Joi.string().guid({ version: "uuidv4" }).required(),
    }),
    requiredRoles: MAINTENANCE_MANAGER_ROLES,
    allowedEmails: [MAINTENANCE_MANAGER_EMAIL],
    run: async (input, { actingUser }) =>
      maintenanceService.assignTechnician(actingUser.id, input.id, input.technicianId),
  });
}

module.exports = { createAssignMaintenanceTechnicianTool };
