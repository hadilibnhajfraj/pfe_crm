"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const notificationService = require("../../../../services/notification.service");

// Calls services/notification.service.js exclusively (extraction fidèle de
// routes/notifications.routes.js PUT /:id/read — portée déjà limitée à
// l'utilisateur courant côté service, {status:404} si absente/pas la sienne).
function createMarkNotificationReadTool() {
  return new ServiceBackedTool({
    name: "mark_notification_read",
    description: "Marque une notification précise comme lue.",
    inputSchema: Joi.object({ id: Joi.string().guid({ version: "uuidv4" }).required() }),
    requiredRoles: [],
    run: async (input, { actingUser }) => notificationService.markOneRead(actingUser.id, input.id),
  });
}

module.exports = { createMarkNotificationReadTool };
