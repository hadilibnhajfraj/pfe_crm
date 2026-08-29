"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const notificationService = require("../../../../services/notification.service");

// Calls services/notification.service.js exclusively (extraction fidèle de
// routes/notifications.routes.js GET /).
function createListMyNotificationsTool() {
  return new ServiceBackedTool({
    name: "list_my_notifications",
    description: "Liste paginée des notifications de l'utilisateur courant, avec compteur non-lues.",
    inputSchema: Joi.object({
      page: Joi.number().integer().min(1).optional(),
      limit: Joi.number().integer().min(1).max(100).optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) => notificationService.listMyNotifications(actingUser.id, input),
  });
}

module.exports = { createListMyNotificationsTool };
