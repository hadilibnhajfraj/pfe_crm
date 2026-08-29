"use strict";

const { BaseAutomation } = require("./baseAutomation");

// Défaut "meilleur effort" : marque candidate à la suppression une
// notification déjà lue de plus de 30 jours — suppose des champs `read`
// (booléen) et `createdAt` (ISO) sur l'élément renvoyé par
// list_my_notifications ; à ajuster via `shouldDelete` si la forme réelle
// diffère (non revérifiée ici, voir reminderAutomation.js pour le même
// avertissement).
const DEFAULT_MAX_AGE_DAYS = 30;

function defaultShouldDelete(notification, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
  if (!notification.read) return false;
  if (!notification.createdAt) return false;
  const ageMs = Date.now() - new Date(notification.createdAt).getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}

/**
 * # NotificationHousekeepingAutomation — "notifications"
 *
 * ## Rôle
 * Nettoie automatiquement les notifications in-app de l'`actingUser` :
 * marque tout comme lu si demandé (`markAllRead`), puis liste ses
 * notifications et supprime celles jugées obsolètes par `shouldDelete` —
 * toujours via `list_my_notifications`/`mark_all_notifications_read`/
 * `delete_notification`, jamais une purge SQL directe.
 *
 * ## Entrée
 * `run({ actingUser })`
 *
 * ## Sortie
 * `{ actions: [{action, id?, output}], errors: [{action, id?, message}] }`
 */
class NotificationHousekeepingAutomation extends BaseAutomation {
  constructor({ tools = [], shouldDelete = defaultShouldDelete, markAllRead = false, requiredRoles = [], allowedEmails = [] } = {}) {
    super({
      name: "notification_housekeeping",
      tools,
      allowedToolNames: ["list_my_notifications", "mark_all_notifications_read", "delete_notification"],
      requiredRoles,
      allowedEmails,
    });
    this.shouldDelete = shouldDelete;
    this.markAllRead = markAllRead;
  }

  async _execute() {
    const actions = [];
    const errors = [];

    if (this.markAllRead) {
      try {
        const output = await this._callTool("mark_all_notifications_read");
        actions.push({ action: "mark_all_read", output });
      } catch (err) {
        errors.push({ action: "mark_all_read", message: err.message });
      }
    }

    let notifications;
    try {
      const result = await this._callTool("list_my_notifications");
      notifications = Array.isArray(result) ? result : result.items || result.data || [];
    } catch (err) {
      errors.push({ action: "list_my_notifications", message: err.message });
      return { actions, errors };
    }

    for (const notification of notifications.filter((n) => this.shouldDelete(n))) {
      try {
        const output = await this._callTool("delete_notification", { id: notification.id });
        actions.push({ action: "delete_notification", id: notification.id, output });
      } catch (err) {
        errors.push({ action: "delete_notification", id: notification.id, message: err.message });
      }
    }

    return { actions, errors };
  }
}

function createNotificationHousekeepingAutomation(deps = {}) {
  return new NotificationHousekeepingAutomation(deps);
}

module.exports = { NotificationHousekeepingAutomation, createNotificationHousekeepingAutomation, defaultShouldDelete, DEFAULT_MAX_AGE_DAYS };
