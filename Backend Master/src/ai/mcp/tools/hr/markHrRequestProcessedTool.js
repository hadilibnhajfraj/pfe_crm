"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");
const { HR_MANAGER_EMAIL } = require("../../../../config/hrManager");
const { HR_REVIEWER_ROLES } = require("../../../../middleware/requireHrReviewer");


function createMarkHrRequestProcessedTool() {
  return new ServiceBackedTool({
    name: "mark_hr_request_processed",
    description: "Marque une demande RH acceptée comme traitée administrativement.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: HR_REVIEWER_ROLES,
    allowedEmails: [HR_MANAGER_EMAIL],
    run: async (input, { actingUser }) => hrRequestService.markProcessed(input.id, actingUser),
  });
}

module.exports = { createMarkHrRequestProcessedTool };
