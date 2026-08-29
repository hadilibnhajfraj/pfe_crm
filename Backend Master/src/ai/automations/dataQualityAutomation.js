"use strict";

const { BaseAutomation } = require("./baseAutomation");

// Défaut "meilleur effort" (voir reminderAutomation.js pour le même
// avertissement) : signale les utilisateurs actifs sans rôle assigné —
// `findIssues` reçoit la liste COMPLÈTE (pas un élément à la fois), utile
// pour des vérifications qui portent sur l'ensemble (doublons, ...).
const DEFAULT_CHECKS = [
  {
    listToolName: "list_users",
    listInput: {},
    findIssues: (items) =>
      items
        .filter((user) => user.active !== false && !user.role)
        .map((user) => ({ type: "missing_role", userId: user.id, message: `Utilisateur actif "${user.id}" sans rôle assigné.` })),
  },
];

/**
 * # DataQualityAutomation — "qualité des données"
 *
 * ## Rôle
 * Détecte des problèmes de qualité (champ manquant, doublon, incohérence)
 * dans des ensembles de données CRM lus via des Tools existants — jamais un
 * script SQL de diagnostic écrit à part. Chaque `check` est indépendant :
 * l'échec de son Tool de liste ne bloque pas les autres vérifications.
 *
 * ## Entrée
 * `run({ actingUser })` — les `checks` (Tool de liste + fonction
 * `findIssues(items)`) sont fixés à la construction.
 *
 * ## Sortie
 * `{ actions: [{check, issue}], errors: [{check, message}] }`
 */
class DataQualityAutomation extends BaseAutomation {
  constructor({ tools = [], checks = DEFAULT_CHECKS, requiredRoles = ["admin", "superadmin", "superadmin2"], allowedEmails = [] } = {}) {
    super({ name: "data_quality", tools, allowedToolNames: checks.map((check) => check.listToolName), requiredRoles, allowedEmails });
    this.checks = checks;
  }

  async _execute() {
    const actions = [];
    const errors = [];

    for (const check of this.checks) {
      let items;
      try {
        const result = await this._callTool(check.listToolName, check.listInput || {});
        items = Array.isArray(result) ? result : result.items || result.data || [];
      } catch (err) {
        errors.push({ check: check.listToolName, message: err.message });
        continue;
      }

      for (const issue of check.findIssues(items)) {
        actions.push({ check: check.listToolName, issue });
      }
    }

    return { actions, errors };
  }
}

function createDataQualityAutomation(deps = {}) {
  return new DataQualityAutomation(deps);
}

module.exports = { DataQualityAutomation, createDataQualityAutomation, DEFAULT_CHECKS };
