"use strict";

/**
 * # dataCoherenceChecker — étape 8 : vérifier la cohérence des données
 *
 * ## Rôle
 * Avant que le Copilot ne s'appuie sur des données projet pour répondre, ce
 * module signale deux catégories de problèmes RÉELS, calculables uniquement
 * à partir de champs déjà présents dans la fiche projet renvoyée par
 * `list_projects` (`toProjectCard()`, `modules/kanban/services/kanban.service.js`)
 * — jamais un champ inventé :
 * 1. **Fiche incomplète** — réutilise `completionRate`/`missingFields`, DÉJÀ
 *    calculés par `computeCompletion()` (`modules/projects/utils/project.completion.js`)
 *    et déjà présents dans CHAQUE fiche projet (`toProjectCard()` les inclut
 *    via `...computeCompletion(p)`) — un signal réel qui existait avant
 *    cette passe mais n'était jamais consommé côté IA (écart comblé ici,
 *    pas une nouvelle règle métier inventée).
 * 2. **Incohérence logique** — deux champs déjà présents qui se
 *    contredisent (ex. étape marquée "gagnée" mais avancement < 100 % ;
 *    montant marché renseigné mais avancement jamais suivi).
 *
 * Entièrement hors-ligne et déterministe — même philosophie que
 * `ProjectAttentionAnalyzer` (`projectAttentionAnalyzer.js`, voir
 * `BUSINESS_REASONING.md`), dont ce module est le complément : l'un évalue
 * l'URGENCE métier, l'autre la FIABILITÉ des données sous-jacentes.
 *
 * ## Entrée
 * `checkProjectsCoherence(projects, { completionThreshold? })` — `projects`
 * au même format que `list_projects` (`data`).
 *
 * ## Sortie
 * `{ projectId, projectName, warnings: string[] }[]` — UN élément par
 * projet ayant au moins un avertissement (silence total si tout est
 * cohérent, jamais un avertissement fabriqué pour "avoir quelque chose à
 * dire").
 */

const DEFAULT_COMPLETION_THRESHOLD = 60;

function checkProjectCoherence(project, { completionThreshold = DEFAULT_COMPLETION_THRESHOLD } = {}) {
  const warnings = [];

  if (typeof project.completionRate === "number" && project.completionRate < completionThreshold) {
    const missing = (project.missingFields || []).join(", ");
    warnings.push(`Fiche incomplète (${project.completionRate}% des champs renseignés)${missing ? ` — manque : ${missing}` : ""}.`);
  }

  const stage = project.stage || project.pipelineStage;
  const progress = project.pourcentageReussite != null ? Number(project.pourcentageReussite) : null;
  if (stage && stage.isWonStage && progress != null && progress < 100) {
    warnings.push(`Étape marquée "gagnée" mais avancement à seulement ${progress}% — donnée potentiellement incohérente.`);
  }

  if (project.montantMarche != null && progress === null) {
    warnings.push(`Montant marché renseigné (${project.montantMarche}) mais aucun avancement suivi — donnée potentiellement incohérente.`);
  }

  return warnings;
}

function checkProjectsCoherence(projects, options) {
  const flagged = [];
  for (const project of projects) {
    const warnings = checkProjectCoherence(project, options);
    if (warnings.length > 0) {
      flagged.push({ projectId: project.id, projectName: project.nomProjet || project.title || "Projet sans nom", warnings });
    }
  }
  return flagged;
}

module.exports = { checkProjectCoherence, checkProjectsCoherence, DEFAULT_COMPLETION_THRESHOLD };
