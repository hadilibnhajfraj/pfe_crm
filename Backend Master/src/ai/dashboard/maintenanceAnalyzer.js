"use strict";

const { DomainAnalyzer } = require("./domainAnalyzer");

// Utilise les valeurs réelles des énumérations Joi des Tools (voir
// mcp/tools/maintenance/*.js) : statut ∈ {en_attente, acceptee, en_cours,
// terminee, refusee}, urgence ∈ {faible, moyenne, critique}. Filtre côté
// Tool (list_all_maintenance_requests({statut, urgence})) plutôt que côté
// client quand c'est possible.
const DEFAULT_DATA_SOURCES = [{ key: "requests", listToolName: "list_all_maintenance_requests", listInput: {} }];

function buildDefaultRules({ pendingBacklogThreshold = 10 } = {}) {
  return {
    alerts: [
      ({ data }) =>
        data.requests
          .filter((request) => request.urgence === "critique" && request.statut === "en_attente")
          .map((request) => ({
            type: "critical_pending_maintenance",
            requestId: request.id,
            message: `La demande de maintenance "${request.title || request.id}" est critique et toujours en attente.`,
          })),
    ],
    risks: [
      ({ data }) => {
        const pending = data.requests.filter((request) => request.statut === "en_attente");
        return pending.length > pendingBacklogThreshold
          ? { type: "maintenance_backlog", count: pending.length, message: `${pending.length} demandes de maintenance en attente — au-delà du seuil de ${pendingBacklogThreshold}.` }
          : null;
      },
    ],
    recommendations: [
      ({ data }) => {
        const critical = data.requests.filter((request) => request.urgence === "critique" && request.statut === "en_attente");
        return critical.length > 0
          ? { type: "reassign_critical_requests", message: `${critical.length} demande(s) critique(s) en attente — envisager une réaffectation immédiate.` }
          : null;
      },
    ],
    forecasts: [
      // Heuristique sur l'instantané actuel (pas une série temporelle) :
      // proportion de demandes encore en attente, comme estimation grossière
      // de la charge de retard ("backlog ratio").
      ({ data }) => {
        if (data.requests.length === 0) return null;
        const pending = data.requests.filter((request) => request.statut === "en_attente").length;
        return {
          type: "backlog_ratio_estimate",
          metric: "pending_ratio",
          value: Math.round((pending / data.requests.length) * 100) / 100,
          basis: "instantané actuel (pas une série temporelle)",
        };
      },
    ],
  };
}

function createMaintenanceAnalyzer({ tools = [], dataSources = DEFAULT_DATA_SOURCES, rules, pendingBacklogThreshold, requiredRoles = [], allowedEmails = [] } = {}) {
  return new DomainAnalyzer({
    domain: "maintenance",
    tools,
    dataSources,
    rules: rules || buildDefaultRules({ pendingBacklogThreshold }),
    requiredRoles,
    allowedEmails,
  });
}

module.exports = { createMaintenanceAnalyzer, buildDefaultRules, DEFAULT_DATA_SOURCES };
