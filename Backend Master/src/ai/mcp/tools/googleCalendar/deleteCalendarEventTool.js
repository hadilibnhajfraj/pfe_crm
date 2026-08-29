"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const googleCalendarService = require("../../../../services/googleCalendar.service");

// Calls services/googleCalendar.service.js exclusively. Toujours scopé à
// l'actingUser lui-même — voir createCalendarEventTool.js pour le
// raisonnement complet.
function createDeleteCalendarEventTool() {
  return new ServiceBackedTool({
    name: "delete_calendar_event",
    description: "Supprime un événement du calendrier Google de l'utilisateur courant.",
    inputSchema: Joi.object({
      eventId: Joi.string().min(1).required(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) =>
      googleCalendarService.deleteCalendarEvent({
        userId: actingUser.id,
        eventId: input.eventId,
        commercialLabel: actingUser.email || actingUser.id,
      }),
  });
}

module.exports = { createDeleteCalendarEventTool };
