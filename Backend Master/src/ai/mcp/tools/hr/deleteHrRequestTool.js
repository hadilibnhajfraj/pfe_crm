"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");

// deleteRequest() vérifie déjà assertOwnership(record, actor) + interdit la
// suppression d'une demande déjà traitée par un non-reviewer, en interne.
function createDeleteHrRequestTool() {
  return new ServiceBackedTool({
    name: "delete_hr_request",
    description: "Supprime une demande RH (le demandeur uniquement, tant qu'elle est en attente ; un reviewer, à tout moment).",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) => hrRequestService.deleteRequest(input.id, actingUser),
  });
}

module.exports = { createDeleteHrRequestTool };
