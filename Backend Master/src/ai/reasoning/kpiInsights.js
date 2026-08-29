"use strict";

/**
 * # kpiInsights — comparaisons, prévisions, graphiques et alertes sur des KPI réels
 *
 * ## Rôle
 * Fonctions pures et déterministes (même philosophie que
 * `businessAnalyzer.js`/`dataQualityAnalyzer.js` : hors-ligne, aucun appel
 * modèle, aucune dépendance vers `orchestrator/`/`agents/`), consommées par
 * `KpiAgent` (`agents/kpiAgent.js`) pour construire un "Dashboard
 * intelligent" — voir `orchestrator/KPI_AGENT.md`.
 *
 * ## La seule donnée historique réellement disponible
 * Aucun Tool MCP ne stocke un instantané périodique des KPI (vérifié —
 * voir KPI_AGENT.md). La SEULE série multi-points réelle exposée par les
 * Tools du module Dashboard est une répartition PAR MOIS DE CRÉATION DES
 * PROJETS (`charts.monthlyEvolution`/`charts.myMonthlyEvolution` de
 * `get_dashboard_kpis`, `monthlyTrend` de `get_legacy_dashboard_kpis`) —
 * chaque fonction ci-dessous n'opère QUE sur ce type de série `[{month,
 * ...valeurs numériques}]`, jamais sur une métrique instantanée isolée
 * (ex. `myRelancesLate`), pour laquelle comparaison/prévision resteraient
 * structurellement impossibles à établir honnêtement.
 */

function round(n) {
  return Math.round(n * 100) / 100;
}

function direction(delta) {
  if (delta > 0) return "hausse";
  if (delta < 0) return "baisse";
  return "stable";
}

function sortedByMonth(series) {
  return (series || []).filter((entry) => entry && typeof entry.month === "string").sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

// Compare les deux DERNIERS points d'une série mensuelle réelle — jamais
// fabriquée si l'historique est trop court pour établir une comparaison.
function compareMonthlyEvolution(series, fields) {
  const points = sortedByMonth(series);
  if (points.length < 2) {
    return { supported: false, note: "Historique insuffisant (moins de 2 mois de données) pour établir une comparaison." };
  }

  const previous = points[points.length - 2];
  const current = points[points.length - 1];
  const metrics = fields.map((field) => {
    const previousValue = typeof previous[field] === "number" ? previous[field] : null;
    const currentValue = typeof current[field] === "number" ? current[field] : null;
    if (previousValue === null || currentValue === null) {
      return { field, supported: false };
    }
    const delta = currentValue - previousValue;
    const deltaPct = previousValue !== 0 ? round((delta / previousValue) * 100) : null;
    return {
      field,
      supported: true,
      previousMonth: previous.month,
      currentMonth: current.month,
      previousValue,
      currentValue,
      delta,
      deltaPct,
      direction: direction(delta),
    };
  });

  return { supported: true, previousMonth: previous.month, currentMonth: current.month, metrics };
}

// Prévision heuristique : tendance moyenne des 3 derniers points reportée
// sur le mois suivant — explicitement un heuristique, pas un modèle
// statistique (même discipline que ProjectAttentionAnalyzer/dataQualityAnalyzer).
function forecastNextPeriod(series, field) {
  const points = sortedByMonth(series).filter((entry) => typeof entry[field] === "number");
  if (points.length < 2) {
    return { supported: false, field, note: `Historique insuffisant pour estimer une prévision sur "${field}".` };
  }

  const recent = points.slice(-3);
  const deltas = [];
  for (let i = 1; i < recent.length; i++) deltas.push(recent[i][field] - recent[i - 1][field]);
  const trendPerMonth = round(deltas.reduce((sum, d) => sum + d, 0) / deltas.length);
  const lastPoint = points[points.length - 1];
  const estimatedNextValue = Math.max(0, Math.round(lastPoint[field] + trendPerMonth));

  return {
    supported: true,
    field,
    basedOnMonths: recent.map((p) => p.month),
    lastValue: lastPoint[field],
    trendPerMonth,
    estimatedNextValue,
    note: "Estimation heuristique basée sur la tendance des derniers mois (pas un modèle statistique).",
  };
}

// "Graphiques" : la première structure {labels, series} exposée côté
// backend pour ce domaine (voir KPI_AGENT.md) — dérivée uniquement de
// champs déjà réels, jamais un nouveau champ inventé.
function buildChartSeries(series, fields) {
  const points = sortedByMonth(series);
  if (points.length === 0) {
    return { supported: false, note: "Aucune série mensuelle disponible pour construire un graphique." };
  }
  return {
    supported: true,
    labels: points.map((p) => p.month),
    series: fields.map((field) => ({ name: field, data: points.map((p) => (typeof p[field] === "number" ? p[field] : 0)) })),
  };
}

// "Pourquoi ce KPI augmente/diminue" : la comparaison chiffrée EST le fait
// observé (jamais discutable, calculée ci-dessus) ; les `contributingFactors`
// (déjà produits par `businessAnalyzer.js::analyzeKpiDomain`, jamais
// recalculés ici) sont présentés en corrélation possible, JAMAIS comme une
// causalité prouvée — aucun Tool ne relie un chiffre de causes à un mois
// précis, une affirmation de causalité certaine serait une invention.
function explainMetricMovement(label, metricComparison, contributingFactors = []) {
  if (!metricComparison || !metricComparison.supported) {
    return `${label} : historique insuffisant pour expliquer son évolution.`;
  }

  const { previousValue, currentValue, delta, deltaPct, direction: dir, previousMonth, currentMonth } = metricComparison;
  if (dir === "stable") {
    return `${label} est resté stable (${currentValue}) entre ${previousMonth} et ${currentMonth}.`;
  }

  const deltaText = `${delta > 0 ? "+" : ""}${delta}${deltaPct !== null ? `, soit ${deltaPct > 0 ? "+" : ""}${deltaPct}%` : ""}`;
  const base = `${label} est en ${dir} : ${previousValue} → ${currentValue} entre ${previousMonth} et ${currentMonth} (${deltaText}).`;
  if (contributingFactors.length === 0) return base;
  return `${base} Facteur(s) pouvant y avoir contribué (corrélation, pas une causalité prouvée) : ${contributingFactors.join(" ; ")}.`;
}

// Les alertes du tableau de bord professionnel sont déjà calculées
// côté CRM (`dashboard.service.js::getProfessionalKPIs`) — cette fonction
// se contente de les mettre en mots, jamais un nouveau seuil inventé ici.
function formatProfessionalAlerts(alerts) {
  const a = alerts || {};
  const out = [];
  if (typeof a.overdueProjects === "number" && a.overdueProjects > 0) out.push(`${a.overdueProjects} projet(s) en retard.`);
  if (typeof a.missingValidation === "number" && a.missingValidation > 0) out.push(`${a.missingValidation} projet(s) en attente de validation.`);
  if (typeof a.missingDocuments === "number" && a.missingDocuments > 0) out.push(`${a.missingDocuments} projet(s) avec des documents manquants.`);
  if (typeof a.unreadNotifications === "number" && a.unreadNotifications > 0) out.push(`${a.unreadNotifications} notification(s) non lue(s).`);
  return out;
}

module.exports = {
  compareMonthlyEvolution,
  forecastNextPeriod,
  buildChartSeries,
  explainMetricMovement,
  formatProfessionalAlerts,
};
