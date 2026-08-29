"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const googleCalendarService = require("../../../../services/googleCalendar.service");

// Calls services/googleCalendar.service.js exclusively (extraction fidèle
// de la logique déjà utilisée par followupAutomation.service.js). Toujours
// scopé à l'actingUser lui-même (userId vient de actingUser.id, jamais de
// l'input) — un utilisateur ne peut créer un événement que sur SON PROPRE
// calendrier Google, jamais celui d'un autre. Le service lui-même ne lève
// jamais (voir googleCalendar.service.js) : un compte non connecté ou une
// erreur d'API renvoie {success:false, ...}, jamais une exception — ce Tool
// renvoie donc ce résultat tel quel plutôt que de le traduire en erreur MCP.
function createCreateCalendarEventTool() {
  return new ServiceBackedTool({
    name: "create_calendar_event",
    description: "Crée un événement sur le calendrier Google de l'utilisateur courant (rendez-vous, rappel, ...).",
    inputSchema: Joi.object({
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
      googleCalendarService.createCalendarEvent({
        userId: actingUser.id,
        commercialLabel: actingUser.email || actingUser.id,
        ...input,
      }),
  });
}

module.exports = { createCreateCalendarEventTool };
