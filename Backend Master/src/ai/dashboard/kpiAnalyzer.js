"use strict";

const { DomainAnalyzer } = require("./domainAnalyzer");

// Défauts "meilleur effort" (voir projectsAnalyzer.js pour le même
// avertissement) : get_dashboard_kpis/get_por_promesh_dashboard renvoient
// des objets agrégés dont les noms de champs exacts n'ont pas été
// revérifiés — extraction défensive parmi plusieurs noms plausibles.
const DEFAULT_DATA_SOURCES = [
  { key: "dashboard", listToolName: "get_dashboard_kpis" },
  { key: "porPromesh", listToolName: "get_por_promesh_dashboard" },
];

function extractTotal(dashboard) {
  if (!dashboard || typeof dashboard !== "object") return null;
  const value = dashboard.total ?? dashboard.totalCount ?? dashboard.count;
  return typeof value === "number" ? value : null;
}

function extractValidationRatio(porPromesh) {
  if (!porPromesh || typeof porPromesh !== "object") return null;
  const validated = porPromesh.validated ?? porPromesh.fichesValidees ?? porPromesh.validatedCount;
  const draft = porPromesh.draft ?? porPromesh.fichesBrouillon ?? porPromesh.draftCount;
  if (typeof validated !== "number" || typeof draft !== "number" || validated + draft === 0) return null;
  return Math.round((validated / (validated + draft)) * 100) / 100;
}

function buildDefaultRules({ minTotalThreshold = 1 } = {}) {
  return {
    alerts: [
      ({ data }) => {
        const total = extractTotal(data.dashboard);
        return total !== null && total < minTotalThreshold
          ? { type: "low_kpi_volume", metric: "total", value: total, message: `Le volume KPI global (${total}) est en dessous du seuil d'alerte (${minTotalThreshold}).` }
          : null;
      },
    ],
    forecasts: [
      // Heuristique sur l'instantané actuel (pas une série temporelle) :
      // ratio fiches validées / (validées + brouillon) comme estimation
      // grossière du "taux de validation".
      ({ data }) => {
        const ratio = extractValidationRatio(data.porPromesh);
        return ratio !== null
          ? { type: "validation_rate_estimate", metric: "por_promesh_validation_rate", value: ratio, basis: "instantané actuel (pas une série temporelle)" }
          : null;
      },
    ],
    recommendations: [
      ({ data }) => {
        const ratio = extractValidationRatio(data.porPromesh);
        return ratio !== null && ratio < 0.5
          ? { type: "validate_draft_records", message: `Moins de la moitié des fiches POR PROMESH sont validées (${ratio}) — envisager une revue des brouillons.` }
          : null;
      },
    ],
  };
}

function createKpiAnalyzer({ tools = [], dataSources = DEFAULT_DATA_SOURCES, rules, minTotalThreshold, requiredRoles = [], allowedEmails = [] } = {}) {
  return new DomainAnalyzer({
    domain: "kpi",
    tools,
    dataSources,
    rules: rules || buildDefaultRules({ minTotalThreshold }),
    requiredRoles,
    allowedEmails,
  });
}

module.exports = { createKpiAnalyzer, buildDefaultRules, DEFAULT_DATA_SOURCES, extractTotal, extractValidationRatio };
