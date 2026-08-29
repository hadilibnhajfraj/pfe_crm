"use strict";

const { checkProjectsCoherence } = require("./dataCoherenceChecker");

/**
 * # dataQualityAnalyzer — le Data Quality Agent : détecter, noter, proposer, jamais modifier
 *
 * ## Rôle
 * 8 fonctions pures et déterministes, une par catégorie de problème
 * demandée (doublons, informations manquantes, emails invalides,
 * téléphones invalides, documents manquants, incohérences, erreurs de
 * workflow, données orphelines), plus un calcul de Score Qualité et des
 * corrections proposées — jamais exécutées (voir `dataQualityAgent.js` :
 * aucune de ces fonctions n'appelle, ni ne reçoit, un Tool d'écriture).
 *
 * Consomme EXCLUSIVEMENT la fiche projet renvoyée par `list_projects`
 * (`toProjectCard()`) — jamais un nouveau Tool. "Informations manquantes"
 * et "incohérences" réutilisent respectivement `computeCompletion()` (déjà
 * calculé côté CRM, exposé via `completionRate`/`missingFields`) et
 * `dataCoherenceChecker.js` (déjà construit, Business Reasoning) — jamais
 * une deuxième logique. Les règles emails/téléphones réutilisent
 * EXACTEMENT les mêmes expressions régulières que
 * `routes/projects.routes.js::isValidEmail`/`isValidPhone` — jamais une
 * règle de validation différente qui pourrait diverger de ce que le
 * serveur accepte réellement.
 *
 * ## Garantie "ne jamais modifier les données automatiquement"
 * Chaque fonction est UNE LECTURE PURE — aucune ne prend un `Tool`, un
 * `mcpServer`, ou quoi que ce soit capable d'écrire, en paramètre. Il est
 * donc structurellement impossible qu'un appel à l'une de ces fonctions
 * modifie une donnée — voir `test/ai.agents.dataQualityAgent.test.js`,
 * "ne modifie jamais rien automatiquement".
 */

// Mêmes règles EXACTES que le serveur (routes/projects.routes.js) — jamais
// une validation plus stricte ou plus permissive qui divergerait de ce que
// le serveur accepte réellement.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidPhone(value) {
  const s = String(value).trim();
  return s.length >= 6 && s.length <= 30 && /^[0-9+\s\-()]+$/.test(s);
}

const EMAIL_FIELDS = [
  { field: "emailIngenieur", label: "Email ingénieur" },
  { field: "emailArchitecte", label: "Email architecte" },
];
const PHONE_FIELDS = [
  { field: "telephoneIngenieur", label: "Téléphone ingénieur" },
  { field: "telephoneArchitecte", label: "Téléphone architecte" },
];

// ── 1. Doublons — même nom de projet (normalisé), plusieurs fiches ───────
function detectDuplicates(projects) {
  const groups = new Map();
  for (const project of projects) {
    if (!project.nomProjet) continue;
    const key = project.nomProjet.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(project);
  }

  const items = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    items.push({
      label: group[0].nomProjet,
      reason: `${group.length} projets portent exactement le même nom ("${group[0].nomProjet}").`,
      projectIds: group.map((p) => p.id),
      correction: `Vérifier s'il s'agit bien de ${group.length} projets distincts, ou fusionner/renommer les doublons.`,
    });
  }
  return items;
}

// ── 2. Informations manquantes — réutilise computeCompletion() (déjà calculé) ─
function detectMissingInformation(projects) {
  return projects
    .filter((p) => typeof p.completionRate === "number" && (p.missingFields || []).length > 0)
    .map((p) => ({
      label: p.nomProjet,
      reason: `Fiche complète à ${p.completionRate}% — manque : ${p.missingFields.join(", ")}.`,
      projectId: p.id,
      correction: `Compléter les champs manquants : ${p.missingFields.join(", ")}.`,
    }));
}

// ── 3. Emails invalides — un champ RENSEIGNÉ mais mal formé (jamais l'absence,
// déjà couverte par "informations manquantes") ────────────────────────────
function detectInvalidEmails(projects) {
  const items = [];
  for (const project of projects) {
    for (const { field, label } of EMAIL_FIELDS) {
      const value = project[field];
      if (value && !EMAIL_PATTERN.test(value)) {
        items.push({
          label: project.nomProjet,
          reason: `${label} invalide : "${value}".`,
          projectId: project.id,
          correction: `Corriger le format de "${label}" (ex. nom@domaine.tld).`,
        });
      }
    }
  }
  return items;
}

// ── 4. Téléphones invalides — même logique que les emails ────────────────
function detectInvalidPhones(projects) {
  const items = [];
  for (const project of projects) {
    for (const { field, label } of PHONE_FIELDS) {
      const value = project[field];
      if (value && !isValidPhone(value)) {
        items.push({
          label: project.nomProjet,
          reason: `${label} invalide : "${value}".`,
          projectId: project.id,
          correction: `Corriger le format de "${label}" (6 à 30 caractères, chiffres/+/espace/-/parenthèses).`,
        });
      }
    }
  }
  return items;
}

// ── 5. Documents manquants — proxy : aucune pièce jointe sur le projet ───
function detectMissingDocuments(projects) {
  return projects
    .filter((p) => !p.attachmentsCount)
    .map((p) => ({
      label: p.nomProjet,
      reason: "Aucun document ou pièce jointe associé à ce projet.",
      projectId: p.id,
      correction: "Vérifier qu'aucun document (devis, plan, pièce administrative) n'a été oublié pour ce projet.",
    }));
}

// ── 6. Incohérences — réutilise dataCoherenceChecker.js (déjà construit) ─
function detectInconsistencies(projects) {
  return checkProjectsCoherence(projects).flatMap((flagged) =>
    flagged.warnings.map((warning) => ({
      label: flagged.projectName,
      reason: warning,
      projectId: flagged.projectId,
      correction: "Corriger le champ à l'origine de l'incohérence signalée.",
    }))
  );
}

// ── 7. Erreurs de workflow — projet archivé mais toujours dans une étape
// OUVERTE (ni gagnée, ni perdue) : l'archivage n'a pas clos le pipeline ──
function detectWorkflowErrors(projects) {
  const items = [];
  for (const project of projects) {
    const stage = project.stage || project.pipelineStage;
    if (project.isArchived && stage && !stage.isWonStage && !stage.isLostStage) {
      items.push({
        label: project.nomProjet,
        reason: `Projet archivé mais toujours dans l'étape ouverte "${stage.name}" (ni gagnée, ni perdue).`,
        projectId: project.id,
        correction: `Déplacer le projet vers une étape "gagnée"/"perdue" avant (ou au moment de) l'archiver.`,
      });
    }
  }
  return items;
}

// ── 8. Données orphelines — sans propriétaire et/ou sans étape de pipeline ─
function detectOrphanedData(projects) {
  const items = [];
  for (const project of projects) {
    if (!project.ownerId) {
      items.push({ label: project.nomProjet, reason: "Aucun propriétaire assigné.", projectId: project.id, correction: "Assigner un propriétaire à ce projet." });
    }
    if (!project.pipelineStageId) {
      items.push({ label: project.nomProjet, reason: "Aucune étape de pipeline assignée.", projectId: project.id, correction: "Assigner ce projet à une étape du pipeline." });
    }
  }
  return items;
}

// ── Score Qualité ──────────────────────────────────────────────────────
// Pénalité moyenne par projet = (Σ poids × nombre d'occurrences) / nombre
// de projets — reste stable quelle que soit la taille du jeu de données
// (10 projets avec 5 problèmes se note comme 100 projets avec 50). Un
// HEURISTIQUE documenté, pas une mesure statistique validée — même
// discipline que ProjectAttentionAnalyzer (voir BUSINESS_REASONING.md).
const QUALITY_SCORE_WEIGHTS = {
  duplicates: 8,
  missingInformation: 3,
  invalidEmails: 5,
  invalidPhones: 5,
  missingDocuments: 3,
  inconsistencies: 6,
  workflowErrors: 6,
  orphanedData: 5,
};

function computeQualityScore(categories, totalProjects) {
  if (!totalProjects || totalProjects <= 0) return 100;
  let penalty = 0;
  for (const [key, weight] of Object.entries(QUALITY_SCORE_WEIGHTS)) {
    penalty += (categories[key] || []).length * weight;
  }
  const score = 100 - penalty / totalProjects;
  return Math.round(Math.max(0, Math.min(100, score)));
}

function analyzeDataQuality(projects) {
  const categories = {
    duplicates: detectDuplicates(projects),
    missingInformation: detectMissingInformation(projects),
    invalidEmails: detectInvalidEmails(projects),
    invalidPhones: detectInvalidPhones(projects),
    missingDocuments: detectMissingDocuments(projects),
    inconsistencies: detectInconsistencies(projects),
    workflowErrors: detectWorkflowErrors(projects),
    orphanedData: detectOrphanedData(projects),
  };
  return { categories, qualityScore: computeQualityScore(categories, projects.length), totalProjects: projects.length };
}

module.exports = {
  detectDuplicates,
  detectMissingInformation,
  detectInvalidEmails,
  detectInvalidPhones,
  detectMissingDocuments,
  detectInconsistencies,
  detectWorkflowErrors,
  detectOrphanedData,
  computeQualityScore,
  analyzeDataQuality,
  QUALITY_SCORE_WEIGHTS,
  EMAIL_PATTERN,
  isValidPhone,
};
