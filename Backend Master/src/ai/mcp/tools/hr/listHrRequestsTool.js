"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");

// Calls modules/hr-requests/services/hrRequest.service.js exclusively.
// listRequests(filters, actor) already restricts results to the actor's
// own requests unless the actor is an HR reviewer/admin-tier (see
// isReviewer() in that service) — this tool forwards actingUser as-is and
// adds no scoping logic of its own.
function createListHrRequestsTool() {
  return new ServiceBackedTool({
    name: "list_hr_requests",
    description:
      "Liste les demandes RH (congé/sortie) visibles par l'utilisateur courant : les siennes, ou toutes pour un gestionnaire RH/admin-tier.",
    inputSchema: Joi.object({
      type: Joi.string().valid("conge", "sortie").optional(),
      statut: Joi.string().valid("en_attente", "acceptee", "refusee", "traitee").optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => {
      return hrRequestService.listRequests(input, actingUser);
    },
  });
}

module.exports = { createListHrRequestsTool };
