"use strict";

const { IDomainAnalyzer } = require("./domainAnalyzer.interface");
const { DashboardError, UnknownAnalyzerToolError, DashboardPermissionError, ConfigurationError } = require("./errors");
const { isAuthorized } = require("../utils/authorization");

const CATEGORIES = ["alerts", "recommendations", "anomalies", "forecasts", "risks", "dataQuality"];

/**
 * # DomainAnalyzer — le moteur générique derrière les 7 analyseurs de domaine
 *
 * ## Rôle
 * Une seule implémentation, configurée différemment pour chacun des 7
 * domaines demandés (projets, pipeline, ventes, maintenance, RH, industriel,
 * KPI) — pas 7 sous-classes quasi identiques (même raisonnement que
 * `BaseAgent`/`BaseAutomation` : la variation entre domaines est de la
 * DONNÉE — quels Tools lire, quelles règles appliquer — jamais du code).
 * Récupère ses données via `dataSources` (des Tools de liste/lecture
 * existants, jamais un accès direct), puis applique des `rules` — une
 * fonction pure par règle, une catégorie parmi les 6 demandées — pour
 * produire des insights structurés.
 *
 * ## Entrée
 * `analyze({ actingUser })`
 *
 * ## Sortie
 * `{ domain, alerts, recommendations, anomalies, forecasts, risks,
 * dataQuality, errors }` — chaque tableau contient des objets `{domain,
 * ...}` (le `domain` est ajouté automatiquement, une règle n'a pas besoin de
 * le répéter). `errors` recueille toute panne (Tool en échec, règle qui
 * lève) sans jamais interrompre le reste de l'analyse.
 *
 * ## Erreurs
 * `DashboardPermissionError` si `actingUser` ne satisfait pas
 * `requiredRoles`/`allowedEmails` — levée avant tout appel de Tool, jamais
 * absorbée. Toute autre erreur (Tool en échec, règle qui lève) est
 * capturée et ajoutée à `errors`.
 */
class DomainAnalyzer extends IDomainAnalyzer {
  constructor({ domain, tools = [], dataSources = [], rules = {}, requiredRoles = [], allowedEmails = [] }) {
    super();
    if (!domain) throw new ConfigurationError("DomainAnalyzer requires a 'domain'.");

    this._domain = domain;
    this.dataSources = dataSources;
    this.rules = Object.fromEntries(CATEGORIES.map((category) => [category, rules[category] || []]));
    this.requiredRoles = requiredRoles;
    this.allowedEmails = allowedEmails;
    this.allowedToolNames = dataSources.map((source) => source.listToolName);
    this._toolsByName = new Map(tools.filter((tool) => this.allowedToolNames.includes(tool.name)).map((tool) => [tool.name, tool]));
  }

  get domain() {
    return this._domain;
  }

  async _callTool(toolName, input = {}) {
    if (!this.allowedToolNames.includes(toolName)) {
      throw new UnknownAnalyzerToolError(this._domain, toolName);
    }
    const tool = this._toolsByName.get(toolName);
    if (!tool) {
      throw new UnknownAnalyzerToolError(this._domain, toolName);
    }
    const raw = await tool.invoke(input);
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }

  async analyze({ actingUser } = {}) {
    if (!isAuthorized({ requiredRoles: this.requiredRoles, allowedEmails: this.allowedEmails }, actingUser)) {
      throw new DashboardPermissionError(this._domain, actingUser && actingUser.role);
    }

    const data = {};
    const errors = [];

    for (const source of this.dataSources) {
      try {
        const result = await this._callTool(source.listToolName, source.listInput || {});
        data[source.key] = Array.isArray(result) ? result : result.items || result.data || result;
      } catch (err) {
        errors.push({ source: source.key, message: err.message });
        data[source.key] = [];
      }
    }

    const insights = { domain: this._domain, alerts: [], recommendations: [], anomalies: [], forecasts: [], risks: [], dataQuality: [], errors };
    const context = { data, actingUser };

    for (const category of CATEGORIES) {
      for (const rule of this.rules[category]) {
        try {
          const found = rule(context);
          const items = Array.isArray(found) ? found : found ? [found] : [];
          for (const item of items) insights[category].push({ domain: this._domain, ...item });
        } catch (err) {
          insights.errors.push({ category, message: err instanceof DashboardError ? err.message : "Unexpected rule failure." });
        }
      }
    }

    return insights;
  }
}

module.exports = { DomainAnalyzer, CATEGORIES };
