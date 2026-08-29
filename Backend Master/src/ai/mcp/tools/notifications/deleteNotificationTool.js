"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const notificationService = require("../../../../services/notification.service");

// Calls services/notification.service.js exclusively (extraction fidèle de
// routes/notifications.routes.js DELETE /:id).
function createDeleteNotificationTool() {
  return new ServiceBackedTool({
    name: "delete_notification",
    description: "Supprime une notification de l'utilisateur courant.",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) => notificationService.deleteNotification(actingUser.id, input.id),
  });
}

module.exports = { createDeleteNotificationTool };
