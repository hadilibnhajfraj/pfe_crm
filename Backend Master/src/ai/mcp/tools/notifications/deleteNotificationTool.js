"use strict";

const Joi = require("joi");
const { uuidString } = require("../../uuidSchema");
const { ServiceBackedTool } = require("../../../tools");
const notificationService = require("../../../../services/notification.service");

// Calls services/notification.service.js exclusively (extraction fidèle de
// routes/notifications.routes.js DELETE /:id).
function createDeleteNotificationTool() {
  return new ServiceBackedTool({
    name: "delete_notification",
    description: "Supprime une notification de l'utilisateur courant.",
    inputSchema: Joi.object({ id: uuidString().required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) => notificationService.deleteNotification(actingUser.id, input.id),
  });
}

module.exports = { createDeleteNotificationTool };
