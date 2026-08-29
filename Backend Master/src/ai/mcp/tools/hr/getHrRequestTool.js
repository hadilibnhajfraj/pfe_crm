"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");

// Calls modules/hr-requests/services/hrRequest.service.js exclusively.
// getRequestById(id, actor) throws {status:403} via assertOwnership() if
// the actor is neither the requester nor an HR reviewer/admin-tier — the
// same rule GET /hr-requests/:id already enforces. ErrorHandler maps that
// thrown {status,message} to a JSON-RPC PERMISSION_DENIED response.
function createGetHrRequestTool() {
  return new ServiceBackedTool({
    name: "get_hr_request",
    description: "Récupère le détail d'une demande RH par identifiant.",
    inputSchema: Joi.object({
      id: Joi.string().guid({ version: "uuidv4" }).required(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => {
      return hrRequestService.getRequestById(input.id, actingUser);
    },
  });
}

module.exports = { createGetHrRequestTool };
