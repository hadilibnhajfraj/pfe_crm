"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");

// getHistory() vérifie déjà assertOwnership(record, actor) en interne.
function createGetHrRequestHistoryTool() {
  return new ServiceBackedTool({
    name: "get_hr_request_history",
    description: "Historique des activités d'une demande RH (créée, acceptée, refusée, commentée...).",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) => hrRequestService.getHistory(input.id, actingUser),
  });
}

module.exports = { createGetHrRequestHistoryTool };
