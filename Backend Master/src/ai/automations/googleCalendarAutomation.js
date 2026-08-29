"use strict";

const { BaseAutomation } = require("./baseAutomation");

/**
 * # GoogleCalendarAutomation — "Google Calendar"
 *
 * ## Rôle
 * Synchronise, par lot, des événements sur le calendrier Google de
 * l'`actingUser` — toujours via `get_calendar_status`/`create_calendar_event`
 * (Tools ajoutés dans cette même passe, mcp/tools/googleCalendar/, qui
 * enveloppent fidèlement `services/googleCalendar.service.js`), jamais un
 * appel direct à l'API Google ou au service. Vérifie d'abord la connexion
 * (`get_calendar_status`) : si le compte n'est pas connecté, s'arrête
 * immédiatement avec une seule action "skipped" plutôt que de tenter (et
 * échouer) un appel par événement.
 *
 * Chaque événement reste scopé au calendrier de l'`actingUser` lui-même
 * (le Tool `create_calendar_event` ignore tout `userId` qu'on tenterait de
 * lui passer — voir ce fichier) : cette automatisation ne peut jamais créer
 * un événement sur le calendrier de quelqu'un d'autre.
 *
 * ## Entrée
 * `run({ actingUser, events: [{summary, description?, location?, startDateTime, endDateTime, timeZone?, reminderMinutes?}] })`
 *
 * ## Sortie
 * `{ actions: [{event, output}] | [{action:"skipped", reason}], errors: [{event, message}] }`
 * — un résultat `{success:false, ...}` renvoyé PAR le Tool (le service ne
 * lève jamais, voir googleCalendar.service.js) est classé en `errors`,
 * exactement comme une exception l'aurait été, pour que `BaseAutomation.run()`
 * rapporte fidèlement `success: false` dans ce cas.
 */
class GoogleCalendarAutomation extends BaseAutomation {
  constructor({ tools = [], statusToolName = "get_calendar_status", createToolName = "create_calendar_event", requiredRoles = [], allowedEmails = [] } = {}) {
    super({ name: "google_calendar", tools, allowedToolNames: [statusToolName, createToolName], requiredRoles, allowedEmails });
    this.statusToolName = statusToolName;
    this.createToolName = createToolName;
  }

  async _execute({ events = [] }) {
    const status = await this._callTool(this.statusToolName);
    if (!status.connected) {
      return { actions: [{ action: "skipped", reason: "not_connected" }], errors: [] };
    }

    const actions = [];
    const errors = [];

    for (const event of events) {
      try {
        const output = await this._callTool(this.createToolName, event);
        if (output.success === false) {
          errors.push({ event, message: output.error || output.reason || "create_calendar_event failed" });
        } else {
          actions.push({ event, output });
        }
      } catch (err) {
        errors.push({ event, message: err.message });
      }
    }

    return { actions, errors };
  }
}

function createGoogleCalendarAutomation(deps = {}) {
  return new GoogleCalendarAutomation(deps);
}

module.exports = { GoogleCalendarAutomation, createGoogleCalendarAutomation };
