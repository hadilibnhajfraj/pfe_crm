"use strict";

const { DomainAnalyzer } = require("./domainAnalyzer");

// Défauts "meilleur effort" (voir projectsAnalyzer.js pour le même
// avertissement) : get_commercial_contact_kpi/get_commercial_contact_analytics
// renvoient des objets agrégés (pas une liste) dont les noms de champs
// exacts n'ont pas été revérifiés — ces règles cherchent parmi plusieurs
// noms plausibles (score/conversionRate/total) plutôt que d'en supposer un
// seul.
const DEFAULT_DATA_SOURCES = [
  { key: "kpi", listToolName: "get_commercial_contact_kpi" },
  { key: "analytics", listToolName: "get_commercial_contact_analytics" },
];

function extractScore(kpi) {
  if (!kpi || typeof kpi !== "object") return null;
  const value = kpi.score ?? kpi.conversionRate ?? kpi.total;
  return typeof value === "number" ? value : null;
}

function buildDefaultRules({ lowScoreThreshold = 0.3 } = {}) {
  return {
    alerts: [
      ({ data }) => {
        const score = extractScore(data.kpi);
        return score !== null && score < lowScoreThreshold
          ? { type: "low_commercial_performance", metric: "score", value: score, message: `Le score commercial global (${score}) est en dessous du seuil d'alerte (${lowScoreThreshold}).` }
          : null;
      },
    ],
    anomalies: [
      // Signale toute valeur numérique négative dans les analytics — jamais
      // attendu pour un compteur/indicateur commercial.
      ({ data }) => {
        const analytics = data.analytics;
        if (!analytics || typeof analytics !== "object") return [];
        return Object.entries(analytics)
          .filter(([, value]) => typeof value === "number" && value < 0)
          .map(([metric, value]) => ({ type: "negative_metric", metric, value, message: `L'indicateur "${metric}" est négatif (${value}), ce qui est inattendu.` }));
      },
    ],
    recommendations: [
      ({ data }) => {
        const score = extractScore(data.kpi);
        return score !== null && score < lowScoreThreshold
          ? { type: "review_commercial_strategy", message: "Performance commerciale faible — envisager une revue des relances en cours." }
          : null;
      },
    ],
  };
}

function createSalesAnalyzer({ tools = [], dataSources = DEFAULT_DATA_SOURCES, rules, lowScoreThreshold, requiredRoles = ["commercial_sedentaire", "admin", "superadmin", "superadmin2"], allowedEmails = [] } = {}) {
  return new DomainAnalyzer({
    domain: "sales",
    tools,
    dataSources,
    rules: rules || buildDefaultRules({ lowScoreThreshold }),
    requiredRoles,
    allowedEmails,
  });
}

module.exports = { createSalesAnalyzer, buildDefaultRules, DEFAULT_DATA_SOURCES, extractScore };
