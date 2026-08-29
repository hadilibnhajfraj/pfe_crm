"use strict";

/**
 * # SUGGESTION_CATALOG — les actions que le Copilot PEUT proposer
 *
 * Chaque entrée décrit une action candidate : un `id`, un `label` français
 * affiché tel quel, et la source de vérité pour sa règle de permission :
 * - `toolName` renseigné (`schedule_meeting`, `notify_team`,
 *   `create_activity`, `create_reminder`) : la permission n'est PAS
 *   dupliquée ici — `SuggestionEngine` la résout dynamiquement depuis le
 *   VRAI Tool MCP (`requiredRoles`/`allowedEmails` du Tool lui-même, via
 *   `toolPermissionIndex`, construit dans `pipeline.js`) — une seule source
 *   de vérité, jamais deux qui pourraient diverger. `create_activity` ET
 *   `create_reminder` pointent vers le MÊME Tool
 *   (`create_project_action`, `mcp/tools/projectActions/`, ajouté pour
 *   fermer cet écart — voir `AUTOMATION_WORKFLOWS.md`) : dans ce CRM, un
 *   rappel n'est jamais un enregistrement indépendant, toujours l'attribut
 *   `dateRelance` d'une activité (voir
 *   `modules/project-actions/services/projectAction.service.js::createAction`)
 *   — jamais deux Tools fabriqués pour un concept qui n'existe qu'une fois
 *   dans le modèle de données réel.
 * - `toolName: null` (`prepare_email`) : aucun Tool de BROUILLON n'existe
 *   (seul `send_notification_email` existe, et il ENVOIE immédiatement —
 *   voir `AUTOMATION_WORKFLOWS.md`) — `requiredRoles`/`allowedEmails` sont
 *   alors déclarés ICI directement, reflétant la RÈGLE RÉELLE de la route
 *   CRM sous-jacente au moment de l'écriture, jamais une valeur inventée.
 */
const SUGGESTION_CATALOG = {
  create_activity: {
    id: "create_activity",
    label: "Créer une activité",
    toolName: "create_project_action",
  },
  prepare_email: {
    id: "prepare_email",
    label: "Préparer un email",
    toolName: null,
    requiredRoles: [],
    allowedEmails: [],
  },
  schedule_meeting: {
    id: "schedule_meeting",
    label: "Programmer une réunion",
    toolName: "create_calendar_event",
  },
  create_reminder: {
    id: "create_reminder",
    label: "Créer un rappel",
    toolName: "create_project_action",
  },
  notify_team: {
    id: "notify_team",
    label: "Notifier l'équipe",
    toolName: "send_notification_email",
  },
};

// Quelle(s) suggestion(s) chaque dimension de ProjectAttentionAnalyzer
// (reasoning/projectAttentionAnalyzer.js, voir BUSINESS_REASONING.md) évoque
// — "retard" reprend EXACTEMENT les 4 actions de l'exemple demandé ; les 5
// autres dimensions sont une extension raisonnable documentée dans
// SMART_SUGGESTIONS.md, pas une exigence littérale de la demande.
const DIMENSION_SUGGESTION_TRIGGERS = {
  retard: ["create_activity", "prepare_email", "schedule_meeting", "create_reminder"],
  echeance: ["schedule_meeting", "create_reminder"],
  blocage: ["create_activity", "notify_team"],
  pipeline: ["create_activity"],
  activite: ["create_activity", "prepare_email"],
  budget: ["prepare_email", "notify_team"],
};

module.exports = { SUGGESTION_CATALOG, DIMENSION_SUGGESTION_TRIGGERS };
