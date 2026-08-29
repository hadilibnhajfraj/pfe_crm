"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const googleCalendarService = require("../../../../services/googleCalendar.service");

// Calls services/googleCalendar.service.js exclusively. Toujours scopé à
// l'actingUser lui-même — voir createCalendarEventTool.js pour le
// raisonnement complet (même contrainte, même comportement best-effort du
// service sous-jacent).
function createUpdateCalendarEventTool() {
  return new ServiceBackedTool({
    name: "update_calendar_event",
    description: "Met à jour un événement existant sur le calendrier Google de l'utilisateur courant.",
    inputSchema: Joi.object({
      eventId: Joi.string().min(1).required(),
      summary: Joi.string().max(255).required(),
      description: Joi.string().max(5000).allow("").optional(),
      location: Joi.string().max(255).allow("").optional(),
      startDateTime: Joi.date().iso().required(),
      endDateTime: Joi.date().iso().required(),
      timeZone: Joi.string().max(64).optional(),
      reminderMinutes: Joi.array().items(Joi.number().integer().min(0)).optional(),
    }),
    requiredRoles: [],
    run: async (input, { actingUser }) =>
      googleCalendarService.updateCalendarEvent({
        userId: actingUser.id,
        commercialLabel: actingUser.email || actingUser.id,
        ...input,
      }),
  });
}

module.exports = { createUpdateCalendarEventTool };
