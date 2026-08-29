"use strict";

/**
 * # buildRecommendationAnswer — met en mots les 7 catégories de conseil
 *
 * Même choix que `attentionAnswerBuilder.js`/`businessAnalysisAnswerBuilder.js` :
 * aucun second appel au modèle — chaque ligne est déjà une phrase correcte,
 * tracée à une raison réelle (`item.reason`), la reformuler via un LLM
 * n'ajouterait qu'un risque de dérive.
 *
 * ## Entrée
 * `buildRecommendationAnswer({ priorities, importantTasks,
 * clientsToFollowUp, criticalProjects, risks, anomalies, recommendedActions })`
 * — chaque valeur un tableau de `{ label, reason, ... }`.
 *
 * ## Sortie
 * Une chaîne de caractères, un bloc `### <Catégorie>` par catégorie
 * NON VIDE — une catégorie vide n'est simplement pas mentionnée (jamais
 * "aucun résultat" répété 7 fois). Si les 7 catégories sont vides, un seul
 * message rassurant.
 */
const SECTION_TITLES = {
  priorities: "Priorités",
  importantTasks: "Tâches importantes",
  clientsToFollowUp: "Clients à relancer",
  criticalProjects: "Projets critiques",
  risks: "Risques",
  anomalies: "Anomalies",
  recommendedActions: "Actions recommandées",
};

function formatItems(items) {
  return items.map((item) => `- ${item.label} — ${item.reason}`).join("\n");
}

function buildRecommendationAnswer(categories) {
  const sections = Object.keys(SECTION_TITLES)
    .map((key) => ({ title: SECTION_TITLES[key], items: categories[key] || [] }))
    .filter((s) => s.items.length > 0)
    .map((s) => `### ${s.title}\n${formatItems(s.items)}`);

  if (sections.length === 0) {
    return "Rien à signaler actuellement : aucune priorité, tâche bloquée, client à relancer, projet critique, risque ou anomalie détecté.";
  }
  return sections.join("\n\n");
}

module.exports = { buildRecommendationAnswer, SECTION_TITLES };
