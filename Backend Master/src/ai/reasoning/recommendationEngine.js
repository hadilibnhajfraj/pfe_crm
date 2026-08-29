"use strict";

/**
 * # recommendationEngine — le Recommendation Agent : conseiller, jamais deviner
 *
 * ## Rôle
 * 6 fonctions pures et déterministes, une par catégorie de conseil demandée
 * (priorités, tâches importantes, clients à relancer, projets critiques,
 * risques, anomalies — la 7e catégorie, "actions recommandées", vient de
 * `orchestrator/suggestionEngine.js`, déjà construit pour Smart
 * Suggestions, réutilisé tel quel par l'Agent, jamais dupliqué ici).
 *
 * Chaque fonction ne fait QUE reclasser/filtrer la sortie DÉJÀ CALCULÉE de
 * `projectAttentionAnalyzer.js`/`dataCoherenceChecker.js` (Business
 * Reasoning, voir `BUSINESS_REASONING.md`) — jamais une deuxième logique de
 * scoring. C'est la RÈGLE MÉTIER de chaque catégorie (quel sous-ensemble de
 * `factors`/`dataQuality` la compose) qui est nouvelle ici, pas le calcul
 * sous-jacent — voir `RECOMMENDATION_AGENT.md` pour la justification de
 * chaque règle.
 *
 * ## Garantie "toute recommandation est justifiée"
 * Chaque élément renvoyé porte un champ `reason` — toujours la phrase EXACTE
 * déjà produite par `ProjectAttentionAnalyzer`/`dataCoherenceChecker`
 * (jamais reformulée, jamais fabriquée). Un élément sans raison traçable
 * n'est simplement jamais généré.
 */

const DEFAULT_PRIORITY_LIMIT = 5;

function topFactorReason(entry) {
  return entry.factors.length > 0 ? entry.factors[0].reason : null;
}

// ── Priorités : les projets les plus urgents, tous facteurs confondus ────
function identifyPriorities(ranked, { limit = DEFAULT_PRIORITY_LIMIT } = {}) {
  return ranked
    .filter((r) => r.priority !== "faible")
    .slice(0, limit)
    .map((r) => ({ label: r.projectName, reason: topFactorReason(r), priority: r.priority, score: r.score }));
}

// ── Tâches importantes : la dimension "blocage" — une action concrète
// (lastAction) réellement bloquée, pas une supposition.
function identifyImportantTasks(ranked) {
  return ranked.flatMap((r) =>
    r.factors.filter((f) => f.dimension === "blocage").map((f) => ({ label: r.projectName, reason: f.reason, priority: r.priority }))
  );
}

// ── Clients à relancer : la dimension "retard" (relance de suivi
// dépassée) — proxy assumé pour "client", voir RECOMMENDATION_AGENT.md
// (aucun Tool existant ne liste les relances par contact commercial).
function identifyClientsToFollowUp(ranked) {
  return ranked.flatMap((r) =>
    r.factors.filter((f) => f.dimension === "retard").map((f) => ({ label: r.projectName, reason: f.reason, priority: r.priority }))
  );
}

// ── Projets critiques : priorité "critique" au sens de ProjectAttentionAnalyzer.
function identifyCriticalProjects(ranked) {
  return ranked.filter((r) => r.priority === "critique").map((r) => ({ label: r.projectName, reason: topFactorReason(r), score: r.score }));
}

// ── Risques : tous les facteurs des projets critiques/élevés, plus — si
// fourni — un risque agrégé issu de get_maintenance_stats (demandes
// critiques), un Tool déjà existant, jamais un nouveau Tool.
function identifyRisks(ranked, { maintenanceStats = null } = {}) {
  const projectRisks = ranked
    .filter((r) => r.priority === "critique" || r.priority === "elevee")
    .flatMap((r) => r.factors.map((f) => ({ label: r.projectName, reason: f.reason, severity: f.severity })));

  const risks = [...projectRisks];
  if (maintenanceStats && typeof maintenanceStats.critique === "number" && maintenanceStats.critique > 0) {
    risks.push({
      label: "Maintenance",
      reason: `${maintenanceStats.critique} demande(s) de maintenance de niveau critique en cours.`,
      severity: 3,
    });
  }
  return risks;
}

// ── Anomalies : fiches projet incomplètes/incohérentes — dataCoherenceChecker.
function identifyAnomalies(dataQuality) {
  return dataQuality.flatMap((d) => d.warnings.map((warning) => ({ label: d.projectName, reason: warning })));
}

module.exports = {
  identifyPriorities,
  identifyImportantTasks,
  identifyClientsToFollowUp,
  identifyCriticalProjects,
  identifyRisks,
  identifyAnomalies,
  DEFAULT_PRIORITY_LIMIT,
};
