"use strict";

/**
 * # buildBusinessAnalysisAnswer — met en mots l'analyse calculée par businessAnalyzer
 *
 * ## Rôle
 * Traduit un ou plusieurs résultats de `businessAnalyzer.js` (déjà
 * calculés, déjà factuels) en un texte français structuré en 4 sections —
 * **Résultat**, **Causes**, **Risques**, **Recommandations** — SANS second
 * appel au modèle de langage, même choix que `attentionAnswerBuilder.js` :
 * les phrases sont déjà correctes et tracées à une donnée réelle, les
 * reformuler via un LLM n'ajouterait qu'un risque de dérive.
 *
 * ## Entrée
 * `buildBusinessAnalysisAnswer(analyses)` — `analyses` est un tableau de
 * `{ domain: string, label: string, analysis: {supported, result, causes,
 * risks, recommendations, note?} }` (la sortie d'une fonction de
 * `businessAnalyzer.js`, associée au libellé du domaine).
 *
 * ## Sortie
 * Une chaîne de caractères multi-lignes, un bloc par domaine analysé.
 */
function formatSection(title, items) {
  if (!items || items.length === 0) return null;
  return `${title} :\n${items.map((i) => `- ${i}`).join("\n")}`;
}

function formatDomain({ label, analysis }) {
  if (!analysis.supported) {
    return `### ${label}\n${analysis.note}`;
  }

  const sections = [
    formatSection("Résultat", analysis.result),
    formatSection("Causes", analysis.causes),
    formatSection("Risques", analysis.risks),
    formatSection("Recommandations", analysis.recommendations),
  ].filter(Boolean);

  return `### ${label}\n${sections.join("\n\n")}`;
}

function buildBusinessAnalysisAnswer(analyses) {
  if (!analyses || analyses.length === 0) {
    return "Je n'ai pas pu identifier de domaine à analyser dans votre question.";
  }
  return analyses.map(formatDomain).join("\n\n");
}

module.exports = { buildBusinessAnalysisAnswer };
