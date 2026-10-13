"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const hrRequestService = require("../../../../modules/hr-requests/services/hrRequest.service");
const { HR_MANAGER_EMAIL } = require("../../../../config/hrManager");
const { HR_REVIEWER_ROLES } = require("../../../../middleware/requireHrReviewer");


function createRejectHrRequestTool() {
  return new ServiceBackedTool({
    name: "reject_hr_request",
    description: "Refuse une demande RH en attente.",
    inputSchema: Joi.object({
      id: uuidString().required(),
      comment: Joi.string().max(2000).allow(null, "").optional(),
    }),
    requiredRoles: HR_REVIEWER_ROLES,
    allowedEmails: [HR_MANAGER_EMAIL],
    run: async (input, { actingUser }) => hrRequestService.rejectRequest(input.id, actingUser, input.comment),
  });
}

module.exports = { createRejectHrRequestTool };
