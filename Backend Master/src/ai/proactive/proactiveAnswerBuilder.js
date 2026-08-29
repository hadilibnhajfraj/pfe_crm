"use strict";

const { DIMENSION_RECOMMENDATIONS } = require("../reasoning/businessAnalyzer");

/**
 * # proactiveAnswerBuilder — un risque détecté devient une alerte complète
 *
 * ## Rôle
 * Transforme un risque déjà détecté par un moteur EXISTANT (jamais une
 * deuxième logique de scoring — voir `proactiveMonitor.js`) en un objet
 * `ProactiveAlert` uniforme, portant les 5 volets demandés :
 * - **notification** — pas un champ ici : c'est `alertDispatcher.js` qui
 *   notifie réellement (e-mail + ligne `Notification` + push Socket.IO),
 *   à partir de `subject`/`formatAlertMessage()` ci-dessous.
 * - `analysis` — les faits bruts déjà calculés (score/priorité/facteurs
 *   pour un projet ; type/métrique/valeur pour un domaine Dashboard IA) —
 *   un artefact structuré distinct, jamais mélangé au texte.
 * - `explanation` — la même chose en français lisible (les raisons déjà
 *   calculées, jamais reformulées par un modèle de langage).
 * - `suggestion` — un texte de recommandation (`DIMENSION_RECOMMENDATIONS`,
 *   `reasoning/businessAnalyzer.js`, déjà réel pour les projets ; les
 *   `recommendations` déjà calculées par `DomainAnalyzer` pour les autres
 *   domaines) — toujours présent, avec un repli honnête si rien de plus
 *   précis n'existe.
 * - `workflowTemplate` — une proposition RÉELLEMENT exécutable (un Tool +
 *   une entrée complète, jamais devinée) — voir `buildWorkflowTemplate()`
 *   ci-dessous pour les conditions strictes qui doivent être réunies avant
 *   d'en construire un. `null` sinon : jamais un Tool appelé avec des
 *   données inventées. `alertDispatcher.js` transforme ce gabarit interne
 *   en une proposition confirmable via `ProactiveActionStore` — voir sa
 *   propre doc.
 *
 * Entièrement hors-ligne et déterministe — aucune donnée n'est jamais
 * inventée : chaque champ recopie ou reformate un fait déjà calculé par
 * `ProjectAttentionAnalyzer`/`DomainAnalyzer`/`SuggestionEngine`.
 */

// Un `workflowTemplate` n'est construit QUE pour ces 2 suggestions — les
// SEULES dont le Tool sous-jacent (`create_project_action`, voir
// suggestionCatalog.js) n'a besoin d'AUCUNE donnée qu'on ne possède pas déjà
// (`projectId` + la raison déjà calculée). `prepare_email`/`schedule_meeting`/
// `notify_team` exigeraient de deviner un destinataire, un horaire ou un
// message — jamais fabriqués, voir PROACTIVE_AI.md.
const WORKFLOW_ELIGIBLE_SUGGESTION_IDS = new Set(["create_activity", "create_reminder"]);
const WORKFLOW_TOOL_NAME = "create_project_action";

function buildWorkflowTemplate(entry, suggestions) {
  const eligible = suggestions.find((s) => WORKFLOW_ELIGIBLE_SUGGESTION_IDS.has(s.id));
  if (!eligible) return null;

  return {
    label: eligible.label,
    reason: eligible.reason,
    tool: WORKFLOW_TOOL_NAME,
    input: {
      projectId: entry.projectId,
      commentaire: `[Copilot IA — surveillance proactive] ${eligible.reason}`,
      dateAction: new Date().toISOString(),
    },
  };
}

// Projets — un risque = un facteur signalé par ProjectAttentionAnalyzer sur
// un projet de priorité "critique"/"elevee" ; "activités"/"échéances" sont
// des FACETTES de ce même classement (dimensions "activite"/"echeance"),
// jamais un module séparé — voir PROACTIVE_AI.md.
function buildProjectAlert(entry, { suggestions = [] } = {}) {
  const dimensions = [...new Set(entry.factors.map((f) => f.dimension))];
  const explanation = entry.factors.map((f) => f.reason).join(" ");
  const suggestionText =
    dimensions
      .map((dim) => DIMENSION_RECOMMENDATIONS[dim])
      .filter(Boolean)
      .join(" ") || `Suivre de près le projet "${entry.projectName}".`;

  return {
    domain: "projects",
    subject: `Projet "${entry.projectName}" — priorité ${entry.priority}`,
    severity: entry.priority,
    analysis: { score: entry.score, priority: entry.priority, factors: entry.factors },
    explanation,
    suggestion: suggestionText,
    suggestedActions: suggestions.map((s) => s.label),
    workflowTemplate: buildWorkflowTemplate(entry, suggestions),
    context: { projectId: entry.projectId, projectName: entry.projectName, dimensions },
  };
}

// Pipeline/Ventes/Maintenance/RH/Industrial/KPI — un risque = UN item déjà
// détecté par DomainAnalyzer (`alerts`/`risks`/`anomalies`, voir
// domainAnalyzer.js), dans la forme réelle `{domain, message, type?,
// metric?, value?}`. `suggestion` reprend l'ENSEMBLE des `recommendations`
// déjà calculées dans le MÊME instantané (pas un appariement 1-pour-1
// inventé — aucun lien formel n'existe entre un risque et une
// recommandation précise dans DomainAnalyzer, voir sa propre doc).
// `workflowTemplate` reste honnêtement `null` : aucun Tool ne peut être
// construit en toute sécurité pour ces domaines sans deviner des données
// (destinataire d'email, horaire de réunion, technicien à affecter...).
function buildDashboardAlert(domainResult, item, category) {
  const recommendationTexts = (domainResult.recommendations || []).map((r) => r.message);
  return {
    domain: domainResult.domain,
    subject: `${categoryLabel(category)} — ${domainResult.domain}`,
    severity: category === "alerts" ? "alerte" : category === "risks" ? "risque" : "anomalie",
    analysis: { type: item.type || null, metric: item.metric || null, value: item.value ?? null, category },
    explanation: item.message || "Problème détecté, sans message détaillé fourni par l'analyseur.",
    suggestion: recommendationTexts.length > 0 ? recommendationTexts.join(" ") : "Aucune recommandation automatique disponible pour ce domaine — revue manuelle nécessaire.",
    suggestedActions: [],
    workflowTemplate: null,
    context: { type: item.type || null, metric: item.metric || null, value: item.value ?? null },
  };
}

function categoryLabel(category) {
  return { alerts: "Alerte", risks: "Risque", anomalies: "Anomalie" }[category] || category;
}

// Un texte français complet, prêt à être envoyé tel quel (objet de l'email
// = `subject`, corps = ce texte) — jamais un second appel au modèle.
function formatAlertMessage(alert) {
  const lines = [`Analyse : ${alert.explanation}`, `Suggestion : ${alert.suggestion}`];
  if (alert.workflowTemplate) {
    lines.push(`Workflow proposé (nécessite votre confirmation dans le Copilot, jamais exécuté automatiquement) : ${alert.workflowTemplate.label}.`);
  } else if (alert.suggestedActions.length > 0) {
    lines.push(`Actions possibles (à confirmer, jamais exécutées automatiquement) : ${alert.suggestedActions.join(", ")}.`);
  }
  return lines.join("\n");
}

module.exports = { buildProjectAlert, buildDashboardAlert, formatAlertMessage, WORKFLOW_ELIGIBLE_SUGGESTION_IDS, WORKFLOW_TOOL_NAME };
