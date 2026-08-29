"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const notificationService = require("../../../../services/notification.service");

// Calls services/notification.service.js exclusively (extraction fidèle de
// routes/notifications.routes.js PUT /read-all).
function createMarkAllNotificationsReadTool() {
  return new ServiceBackedTool({
    name: "mark_all_notifications_read",
    description: "Marque toutes les notifications de l'utilisateur courant comme lues.",
    inputSchema: Joi.object({}),
    requiredRoles: [],
    run: async (_input, { actingUser }) => notificationService.markAllRead(actingUser.id),
  });
}

module.exports = { createMarkAllNotificationsReadTool };
