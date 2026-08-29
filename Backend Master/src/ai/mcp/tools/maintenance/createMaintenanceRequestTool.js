"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");

function createCreateMaintenanceRequestTool() {
  return new ServiceBackedTool({
    name: "create_maintenance_request",
    description: "Signale une panne d'équipement (nouvelle demande de maintenance).",
    inputSchema: Joi.object({
      equipement: Joi.string().max(255).required(),
      typePanne: Joi.string().max(255).optional(),
      urgence: Joi.string().valid("faible", "moyenne", "critique").optional(),
      description: Joi.string().max(5000).optional(),
      photoPaths: Joi.array().items(Joi.string().max(500)).optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => {
      const { photoPaths, ...body } = input;
      return maintenanceService.createRequest(actingUser.id, body, photoPaths || []);
    },
  });
}

module.exports = { createCreateMaintenanceRequestTool };
