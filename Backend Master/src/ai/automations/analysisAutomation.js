"use strict";

const { BaseAutomation } = require("./baseAutomation");

// Tools de lecture (KPI/statistiques) déjà existants — mêmes Tools que
// KPIAgent/ReportingAgent (agents/kpiAgent.js, agents/reportingAgent.js),
// réutilisés ici pour produire un instantané périodique plutôt qu'une
// réponse conversationnelle.
const DEFAULT_SOURCES = ["get_dashboard_kpis", "get_maintenance_stats", "get_commercial_contact_analytics", "get_por_promesh_dashboard"];

/**
 * # AnalysisAutomation — "analyses automatiques"
 *
 * ## Rôle
 * Interroge, par lot, plusieurs Tools de lecture/KPI existants pour produire
 * un instantané d'analyse (ex. exécuté sur une planification quotidienne) —
 * jamais une requête d'agrégation SQL écrite pour l'occasion. Une source à
 * laquelle l'`actingUser` n'a pas accès (permission refusée par le Tool
 * lui-même) est consignée en erreur pour CETTE source, sans empêcher les
 * autres sources d'être interrogées.
 *
 * ## Entrée
 * `run({ actingUser, sources? })` — `sources` (tableau de noms de Tools)
 * remplace `DEFAULT_SOURCES` pour cette exécution si fourni.
 *
 * ## Sortie
 * `{ actions: [{source, output}], errors: [{source, message}] }`
 */
class AnalysisAutomation extends BaseAutomation {
  constructor({ tools = [], sources = DEFAULT_SOURCES, requiredRoles = [], allowedEmails = [] } = {}) {
    super({ name: "automatic_analysis", tools, allowedToolNames: sources, requiredRoles, allowedEmails });
    this.defaultSources = sources;
  }

  async _execute({ sources = this.defaultSources } = {}) {
    const actions = [];
    const errors = [];

    for (const source of sources) {
      try {
        const output = await this._callTool(source);
        actions.push({ source, output });
      } catch (err) {
        errors.push({ source, message: err.message });
      }
    }

    return { actions, errors };
  }
}

function createAnalysisAutomation(deps = {}) {
  return new AnalysisAutomation(deps);
}

module.exports = { AnalysisAutomation, createAnalysisAutomation, DEFAULT_SOURCES };
