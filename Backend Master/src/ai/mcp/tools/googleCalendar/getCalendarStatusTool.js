"use strict";

const Joi = require("joi");
const { ServiceBackedTool } = require("../../../tools");
const googleCalendarService = require("../../../../services/googleCalendar.service");

// Calls services/googleCalendar.service.js exclusively (extraction fidèle de
// routes/googleCalendar.routes.js GET /google-calendar/status). Toujours
// scopé à l'actingUser lui-même — jamais un autre userId en entrée — un
// utilisateur ne peut consulter que l'état de connexion de SON PROPRE
// compte Google Calendar.
function createGetCalendarStatusTool() {
  return new ServiceBackedTool({
    name: "get_calendar_status",
    description: "Vérifie si le compte Google Calendar de l'utilisateur courant est connecté (et son adresse Google si oui).",
    inputSchema: Joi.object({}),
    requiredRoles: [],
    run: async (_input, { actingUser }) => googleCalendarService.getStatus(actingUser.id),
  });
}

module.exports = { createGetCalendarStatusTool };
