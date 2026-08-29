"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");

function createListMaintenanceCommentsTool() {
  return new ServiceBackedTool({
    name: "list_maintenance_comments",
    description: "Liste les commentaires d'une demande de maintenance.",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) =>
      maintenanceService.getComments(actingUser.id, actingUser.role, input.id, actingUser.email),
  });
}

module.exports = { createListMaintenanceCommentsTool };
