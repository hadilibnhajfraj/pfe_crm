"use strict";

const { DomainAnalyzer } = require("./domainAnalyzer");

// Utilise les valeurs réelles des énumérations Joi du Tool list_hr_requests
// (voir mcp/tools/hr/listHrRequestsTool.js) : statut ∈ {en_attente,
// acceptee, refusee, traitee}, type ∈ {conge, sortie}.
const DEFAULT_DATA_SOURCES = [{ key: "requests", listToolName: "list_hr_requests", listInput: {} }];

function buildDefaultRules({ pendingAlertThreshold = 5 } = {}) {
  return {
    alerts: [
      ({ data }) => {
        const pending = data.requests.filter((request) => request.statut === "en_attente");
        return pending.length > pendingAlertThreshold
          ? { type: "hr_requests_pending", count: pending.length, message: `${pending.length} demandes RH en attente — au-delà du seuil de ${pendingAlertThreshold}.` }
          : null;
      },
    ],
    dataQuality: [
      ({ data }) =>
        data.requests
          .filter((request) => !request.type || !request.statut)
          .map((request) => ({ type: "missing_field", requestId: request.id, message: `La demande RH "${request.id}" a un type ou un statut manquant.` })),
    ],
    recommendations: [
      ({ data }) => {
        const pending = data.requests.filter((request) => request.statut === "en_attente");
        return pending.length > 0 ? { type: "review_pending_hr_requests", message: `${pending.length} demande(s) RH en attente de traitement.` } : null;
      },
    ],
  };
}

function createHrAnalyzer({ tools = [], dataSources = DEFAULT_DATA_SOURCES, rules, pendingAlertThreshold, requiredRoles = [], allowedEmails = [] } = {}) {
  return new DomainAnalyzer({
    domain: "hr",
    tools,
    dataSources,
    rules: rules || buildDefaultRules({ pendingAlertThreshold }),
    requiredRoles,
    allowedEmails,
  });
}

module.exports = { createHrAnalyzer, buildDefaultRules, DEFAULT_DATA_SOURCES };
