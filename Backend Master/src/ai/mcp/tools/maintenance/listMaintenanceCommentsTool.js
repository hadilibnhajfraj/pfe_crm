"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const maintenanceService = require("../../../../modules/maintenance-requests/services/maintenanceRequest.service");

function createListMaintenanceCommentsTool() {
  return new ServiceBackedTool({
    name: "list_maintenance_comments",
    description: "Liste les commentaires d'une demande de maintenance.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) =>
      maintenanceService.getComments(actingUser.id, actingUser.role, input.id, actingUser.email),
  });
}

module.exports = { createListMaintenanceCommentsTool };
