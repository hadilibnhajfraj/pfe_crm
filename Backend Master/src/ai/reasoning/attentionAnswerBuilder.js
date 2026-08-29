"use strict";

/**
 * # buildAttentionAnswer — met en mots le classement calculé par ProjectAttentionAnalyzer
 *
 * ## Rôle
 * Traduit la sortie de `analyzeProjectAttention()` (déjà triée, déjà
 * factuelle) en un texte français prêt à être renvoyé comme `answer` —
 * délibérément SANS second appel au modèle de langage : les raisons
 * (`factors[].reason`) sont déjà des phrases correctes, les recomposer via
 * un LLM n'ajouterait aucune information, seulement un risque de
 * paraphrase qui s'écarte des faits calculés. Même choix que
 * `explanationBuilder.js` (déterministe, hors-ligne, testable sans modèle).
 *
 * ## Entrée
 * `buildAttentionAnswer(ranked, { topN? })` — `ranked` est la sortie de
 * `analyzeProjectAttention()`.
 *
 * ## Sortie
 * Une chaîne de caractères multi-lignes. Ne mentionne QUE les projets dont
 * `priority !== "faible"` (rien à signaler = rien à écrire) ; au-delà de
 * `topN` (5 par défaut) projets signalés, une dernière ligne indique le
 * nombre total pour rester honnête sans noyer la réponse.
 */

const PRIORITY_LABELS = {
  critique: "CRITIQUE",
  elevee: "ÉLEVÉE",
  moyenne: "MOYENNE",
  faible: "FAIBLE",
};

function buildAttentionAnswer(ranked, { topN = 5 } = {}) {
  const flagged = ranked.filter((entry) => entry.priority !== "faible");

  if (flagged.length === 0) {
    return "Aucun projet ne nécessite d'attention particulière actuellement : retard, budget, activité, échéances, pipeline et blocages sont tous dans les limites normales.";
  }

  const shown = flagged.slice(0, topN);
  const lines = shown.map((entry, index) => {
    const label = PRIORITY_LABELS[entry.priority] || entry.priority;
    const reasons = entry.factors.map((factor) => factor.reason).join(" ; ");
    return `${index + 1}. ${entry.projectName} — priorité ${label} (score ${entry.score}) : ${reasons}`;
  });

  const intro = `${flagged.length} projet(s) nécessitent une attention, classés par priorité :`;
  const allLines = [intro, ...lines];
  if (flagged.length > shown.length) {
    allLines.push(`... et ${flagged.length - shown.length} autre(s) projet(s) signalé(s) (non affiché(s) ici).`);
  }
  return allLines.join("\n");
}

module.exports = { buildAttentionAnswer, PRIORITY_LABELS };
