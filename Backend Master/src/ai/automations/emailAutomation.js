"use strict";

const { BaseAutomation } = require("./baseAutomation");

/**
 * # EmailAutomation — "emails"
 *
 * ## Rôle
 * Envoie, par lot, des e-mails automatisés (digest, alerte, annonce) en
 * délégant chaque envoi au Tool `send_notification_email` existant — jamais
 * un appel direct à un service d'e-mail. Distincte de `ReminderAutomation` :
 * celle-ci décide QUOI envoyer et À QUI à partir de règles de rappel sur des
 * données CRM ; `EmailAutomation` envoie exactement les e-mails qu'on lui
 * donne, sans logique de détection propre — le bloc de construction bas
 * niveau que `ReminderAutomation` (et d'autres automatisations futures)
 * pourraient réutiliser pour leur propre étape d'envoi.
 *
 * ## Entrée
 * `run({ actingUser, emails: [{ toUserId, emailTo, subject, message, fromName?, type? }] })`
 *
 * ## Sortie
 * `{ actions: [{email, output}], errors: [{email, message}] }`
 */
class EmailAutomation extends BaseAutomation {
  constructor({ tools = [], toolName = "send_notification_email", requiredRoles = ["admin", "superadmin", "superadmin2"], allowedEmails = [] } = {}) {
    super({ name: "emails", tools, allowedToolNames: [toolName], requiredRoles, allowedEmails });
    this.toolName = toolName;
  }

  async _execute({ emails = [] }) {
    const actions = [];
    const errors = [];

    for (const email of emails) {
      try {
        const output = await this._callTool(this.toolName, email);
        actions.push({ email, output });
      } catch (err) {
        errors.push({ email, message: err.message });
      }
    }

    return { actions, errors };
  }
}

function createEmailAutomation(deps = {}) {
  return new EmailAutomation(deps);
}

module.exports = { EmailAutomation, createEmailAutomation };
