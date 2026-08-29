"use strict";

const { BaseAutomation } = require("./baseAutomation");

// Défauts "meilleur effort" : ils listent les demandes en attente via des
// Tools réels et couvrent la forme de notification (send_notification_email
// exige toUserId + emailTo + subject + message — voir
// mcp/tools/notifications/sendNotificationEmailTool.js), mais l'extraction
// exacte des champs (userId/email/titre) sur l'élément retourné dépend de la
// forme réelle de la réponse du service sous-jacent, non revérifiée ici —
// à ajuster via `sources` au câblage réel plutôt que dans ce fichier.
const DEFAULT_SOURCES = [
  {
    listToolName: "list_all_maintenance_requests",
    listInput: { statut: "en_attente" },
    isDue: () => true, // déjà filtré côté Tool par statut
    buildNotification: (item) => ({
      toUserId: item.userId,
      emailTo: item.email,
      subject: "Rappel : demande de maintenance en attente",
      message: `La demande de maintenance "${item.title || item.id}" est toujours en attente de traitement.`,
      type: "reminder",
    }),
  },
  {
    listToolName: "list_hr_requests",
    listInput: { statut: "en_attente" },
    isDue: () => true,
    buildNotification: (item) => ({
      toUserId: item.userId,
      emailTo: item.email,
      subject: "Rappel : demande RH en attente",
      message: `Votre demande RH (${item.type || item.id}) est toujours en attente.`,
      type: "reminder",
    }),
  },
];

/**
 * # ReminderAutomation — "rappels"
 *
 * ## Rôle
 * Moteur de rappel générique : pour chaque `source` configurée (un Tool de
 * liste + un prédicat `isDue(item)` + un constructeur de notification), liste
 * les éléments via ce Tool, retient ceux qui sont dus, et envoie un rappel
 * pour chacun via `send_notification_email` — toujours via les Tools
 * existants, jamais une requête directe sur les demandes en retard.
 *
 * ## Entrée
 * `run({ actingUser })` — les `sources` sont fixées à la construction, pas
 * par appel (ce sont des règles d'automatisation, pas des paramètres de
 * requête utilisateur).
 *
 * ## Sortie
 * `{ actions: [{source, item, output}], errors: [{source, item?, message}] }`
 */
class ReminderAutomation extends BaseAutomation {
  constructor({ tools = [], sources = DEFAULT_SOURCES, notifyToolName = "send_notification_email", requiredRoles = ["admin", "superadmin", "superadmin2"], allowedEmails = [] } = {}) {
    const allowedToolNames = [...new Set([...sources.map((s) => s.listToolName), notifyToolName])];
    super({ name: "reminders", tools, allowedToolNames, requiredRoles, allowedEmails });
    this.sources = sources;
    this.notifyToolName = notifyToolName;
  }

  async _execute({ actingUser }) {
    const actions = [];
    const errors = [];

    for (const source of this.sources) {
      let items;
      try {
        const result = await this._callTool(source.listToolName, source.listInput || {});
        items = Array.isArray(result) ? result : result.items || result.data || [];
      } catch (err) {
        errors.push({ source: source.listToolName, message: err.message });
        continue;
      }

      for (const item of items.filter((candidate) => source.isDue(candidate))) {
        try {
          const notificationInput = source.buildNotification(item, actingUser);
          const output = await this._callTool(this.notifyToolName, notificationInput);
          actions.push({ source: source.listToolName, item, output });
        } catch (err) {
          errors.push({ source: source.listToolName, item, message: err.message });
        }
      }
    }

    return { actions, errors };
  }
}

function createReminderAutomation(deps = {}) {
  return new ReminderAutomation(deps);
}

module.exports = { ReminderAutomation, createReminderAutomation, DEFAULT_SOURCES };
