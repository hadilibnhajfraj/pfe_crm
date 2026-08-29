"use strict";

/**
 * # buildDataQualityAnswer — met en mots le score qualité et les 8 catégories
 *
 * Même choix que les autres `*AnswerBuilder.js` de `reasoning/` : aucun
 * second appel au modèle — chaque ligne cite déjà une raison réelle
 * (`item.reason`) ET une correction PROPOSÉE (`item.correction`), jamais
 * appliquée (voir `dataQualityAgent.js`).
 *
 * ## Entrée
 * `buildDataQualityAnswer({ qualityScore, totalProjects, categories })` —
 * `categories` un objet `{duplicates, missingInformation, invalidEmails,
 * invalidPhones, missingDocuments, inconsistencies, workflowErrors,
 * orphanedData}`, chaque valeur un tableau de `{label, reason, correction}`.
 */
const SECTION_TITLES = {
  duplicates: "Doublons",
  missingInformation: "Informations manquantes",
  invalidEmails: "Emails invalides",
  invalidPhones: "Téléphones invalides",
  missingDocuments: "Documents manquants",
  inconsistencies: "Incohérences",
  workflowErrors: "Erreurs de workflow",
  orphanedData: "Données orphelines",
};

function formatItems(items) {
  return items.map((item) => `- ${item.label} — ${item.reason} → Correction proposée : ${item.correction}`).join("\n");
}

function buildDataQualityAnswer({ qualityScore, totalProjects, categories }) {
  const header = `Score Qualité : ${qualityScore}/100 (sur ${totalProjects} projet(s) analysé(s)).`;

  const sections = Object.keys(SECTION_TITLES)
    .map((key) => ({ title: SECTION_TITLES[key], items: categories[key] || [] }))
    .filter((s) => s.items.length > 0)
    .map((s) => `### ${s.title}\n${formatItems(s.items)}`);

  if (sections.length === 0) {
    return `${header}\n\nAucun problème détecté — doublons, informations manquantes, emails/téléphones invalides, documents manquants, incohérences, erreurs de workflow et données orphelines : rien à signaler.`;
  }

  return [header, ...sections].join("\n\n");
}

module.exports = { buildDataQualityAnswer, SECTION_TITLES };
