"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");
const { HR_MANAGER_EMAIL } = require("../../../../config/hrManager");
const { HR_REVIEWER_ROLES } = require("../../../../middleware/requireHrReviewer");


// acceptRequest() ne vérifie PAS elle-même que l'appelant est un reviewer —
// seule la route (middleware requireHrReviewer) le garantissait. Ce Tool
// reproduit cette même règle (rôle OU e-mail Responsable RH) via
// requiredRoles + allowedEmails plutôt que de la dupliquer en dur.
function createAcceptHrRequestTool() {
  return new ServiceBackedTool({
    name: "accept_hr_request",
    description: "Accepte une demande RH en attente.",
    inputSchema: Joi.object({
      id: Joi.string().guid({ version: "uuidv4" }).required(),
      comment: Joi.string().max(2000).allow(null, "").optional(),
    }),
    requiredRoles: HR_REVIEWER_ROLES,
    allowedEmails: [HR_MANAGER_EMAIL],
    run: async (input, { actingUser }) => hrRequestService.acceptRequest(input.id, actingUser, input.comment),
  });
}

module.exports = { createAcceptHrRequestTool };
