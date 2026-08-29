"use strict";

/**
 * # buildKpiAnswer — met en mots le "Dashboard intelligent" calculé par kpiInsights/businessAnalyzer
 *
 * Même choix que les autres `*AnswerBuilder.js` de `reasoning/` : aucun
 * second appel au modèle — chaque section est déjà calculée à partir de
 * champs réels (voir `agents/kpiAgent.js`, `reasoning/kpiInsights.js`).
 * Une section pour laquelle l'historique est insuffisant reste PRÉSENTE
 * mais affiche une note honnête plutôt que d'être masquée en silence —
 * l'utilisateur doit savoir POURQUOI une comparaison/prévision manque,
 * pas seulement qu'elle manque.
 */

function formatComparisonLine(label, metric) {
  if (!metric || !metric.supported) return `- ${label} : donnée non disponible pour ce mois.`;
  const deltaText = `${metric.delta > 0 ? "+" : ""}${metric.delta}${metric.deltaPct !== null ? `, ${metric.deltaPct > 0 ? "+" : ""}${metric.deltaPct}%` : ""}`;
  return `- ${label} : ${metric.previousValue} → ${metric.currentValue} (${deltaText}) — ${metric.direction}.`;
}

function formatForecastLine(label, forecast) {
  if (!forecast || !forecast.supported) return `- ${label} : ${(forecast && forecast.note) || "prévision non disponible"}.`;
  const trendText = `${forecast.trendPerMonth > 0 ? "+" : ""}${forecast.trendPerMonth}/mois`;
  return `- ${label} : environ ${forecast.estimatedNextValue} estimé le mois prochain (tendance ${trendText}, basé sur ${forecast.basedOnMonths.join(", ")}).`;
}

function buildKpiAnswer({ kpiAnalysis, comparison, forecasts, chart, explanations, alerts, fieldLabels, extraSections = [] }) {
  const sections = [];

  sections.push(`### Résultat\n${kpiAnalysis.result.map((r) => `- ${r}`).join("\n")}`);

  const fieldKeys = Object.keys(fieldLabels);

  const comparisonBody = comparison.supported
    ? fieldKeys.map((f) => formatComparisonLine(fieldLabels[f], comparison.metrics.find((m) => m.field === f))).join("\n")
    : comparison.note;
  sections.push(`### Comparaison (mois précédent → mois en cours)\n${comparisonBody}`);

  sections.push(`### Pourquoi ces indicateurs évoluent-ils ?\n${explanations.map((e) => `- ${e.text}`).join("\n")}`);

  sections.push(`### Prévision (mois prochain, estimation heuristique)\n${forecasts.map((f) => formatForecastLine(f.label, f.forecast)).join("\n")}`);

  const alertLines = alerts.length > 0 ? alerts.map((a) => `- ${a}`).join("\n") : "Aucune alerte détectée.";
  sections.push(`### Alertes\n${alertLines}`);

  if (kpiAnalysis.recommendations.length > 0) {
    sections.push(`### Recommandations\n${kpiAnalysis.recommendations.map((r) => `- ${r}`).join("\n")}`);
  }

  const chartBody = chart.supported
    ? `Labels (mois) : ${chart.labels.join(", ")}\n${chart.series.map((s) => `- ${s.name} : [${s.data.join(", ")}]`).join("\n")}`
    : chart.note;
  sections.push(`### Graphique (données)\n${chartBody}`);

  return [...sections, ...extraSections].join("\n\n");
}

module.exports = { buildKpiAnswer, formatComparisonLine, formatForecastLine };
