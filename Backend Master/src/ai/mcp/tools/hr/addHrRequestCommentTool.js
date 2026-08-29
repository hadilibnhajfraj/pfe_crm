"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");

// addComment() vérifie déjà isReviewer(actor.role, actor.email) en interne
// (throw {status:403} sinon) — pas besoin de requiredRoles/allowedEmails
// ici, même schéma que get_hr_request (portée gérée par le service).
function createAddHrRequestCommentTool() {
  return new ServiceBackedTool({
    name: "add_hr_request_comment",
    description: "Ajoute/remplace le commentaire de révision d'une demande RH (Responsable RH uniquement).",
    inputSchema: Joi.object({
      id: Joi.string().guid({ version: "uuidv4" }).required(),
      comment: Joi.string().max(2000).required(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => hrRequestService.addComment(input.id, actingUser, input.comment),
  });
}

module.exports = { createAddHrRequestCommentTool };
