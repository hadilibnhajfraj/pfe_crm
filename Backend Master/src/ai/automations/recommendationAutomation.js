"use strict";

const { BaseAutomation } = require("./baseAutomation");

// Défaut "meilleur effort" (voir reminderAutomation.js pour le même
// avertissement sur la forme exacte des champs retournés) : signale les
// demandes de maintenance critiques toujours en attente.
const DEFAULT_RULES = [
  {
    listToolName: "list_all_maintenance_requests",
    listInput: { statut: "en_attente", urgence: "critique" },
    evaluate: (item) => ({
      type: "urgent_maintenance_follow_up",
      message: `La demande de maintenance "${item.title || item.id}" est critique et toujours en attente — envisager une réaffectation.`,
    }),
  },
];

/**
 * # RecommendationAutomation — "recommandations"
 *
 * ## Rôle
 * Lit des éléments via des Tools existants et applique une règle
 * d'évaluation (`evaluate(item)`) pour faire émerger des recommandations à
 * l'intention d'un humain — jamais une action déclenchée automatiquement :
 * contrairement à `ReminderAutomation` (qui NOTIFIE) ou `AutoCreationAutomation`
 * (qui CRÉE), celle-ci ne fait que **surfacer un insight** en lecture seule.
 * Chaque `rule` est indépendante : l'échec de son Tool de liste ne bloque
 * pas les autres règles.
 *
 * ## Entrée
 * `run({ actingUser })` — les `rules` (Tool de liste + fonction d'évaluation
 * par élément) sont fixées à la construction, comme les `sources` de
 * `ReminderAutomation`.
 *
 * ## Sortie
 * `{ actions: [{rule, item, recommendation}], errors: [{rule, message}] }`
 */
class RecommendationAutomation extends BaseAutomation {
  constructor({ tools = [], rules = DEFAULT_RULES, requiredRoles = [], allowedEmails = [] } = {}) {
    super({ name: "recommendations", tools, allowedToolNames: rules.map((rule) => rule.listToolName), requiredRoles, allowedEmails });
    this.rules = rules;
  }

  async _execute() {
    const actions = [];
    const errors = [];

    for (const rule of this.rules) {
      let items;
      try {
        const result = await this._callTool(rule.listToolName, rule.listInput || {});
        items = Array.isArray(result) ? result : result.items || result.data || [];
      } catch (err) {
        errors.push({ rule: rule.listToolName, message: err.message });
        continue;
      }

      for (const item of items) {
        const recommendation = rule.evaluate(item);
        if (recommendation) {
          actions.push({ rule: rule.listToolName, item, recommendation });
        }
      }
    }

    return { actions, errors };
  }
}

function createRecommendationAutomation(deps = {}) {
  return new RecommendationAutomation(deps);
}

module.exports = { RecommendationAutomation, createRecommendationAutomation, DEFAULT_RULES };
