"use strict";

const { BaseAgent } = require("./baseAgent");

// Les 9 Tools du module HR-Requests (voir mcp/tools/hr/). getHrRequestPdf/
// getHrRequestPdfBuffer volontairement absents du module Tools lui-même
// (sortie binaire, hors périmètre MCP JSON — voir mcp/tools/hr/index.js).
const ALLOWED_TOOL_NAMES = [
  "list_hr_requests",
  "get_hr_request",
  "create_hr_request",
  "accept_hr_request",
  "reject_hr_request",
  "mark_hr_request_processed",
  "add_hr_request_comment",
  "get_hr_request_history",
  "delete_hr_request",
];

const SYSTEM_PROMPT = [
  "Tu es l'Agent RH du CRM CBI Tunisia.",
  "Tu aides à créer, consulter et suivre les demandes RH (congé/autorisation",
  "de sortie), exclusivement via les Tools fournis.",
  "N'invente jamais un statut, une date ou une information employé : si elle",
  "ne provient pas d'un Tool, dis que tu ne peux pas la fournir.",
].join(" ");

/**
 * HRAgent — prend en charge l'intention `hr` (mission "IMPLÉMENTER HRAgent
 * ET PorPromeshAgent", priorité P1 du rapport d'audit précédent).
 *
 * Permissions laissées ouvertes au niveau de l'Agent (`requiredRoles: []`),
 * même discipline que MaintenanceAgent : `list_hr_requests`/`get_hr_request`/
 * `create_hr_request`/`get_hr_request_history`/`delete_hr_request` sont
 * ouverts à tout employé authentifié — la portée (ses propres demandes, ou
 * toutes pour un reviewer) est déjà appliquée DANS
 * modules/hr-requests/services/hrRequest.service.js (`isReviewer()`/
 * `assertOwnership()`), jamais recalculée ici. Les actions de validation
 * (`accept_hr_request`/`reject_hr_request`/`mark_hr_request_processed`/
 * `add_hr_request_comment`) exigent déjà `HR_REVIEWER_ROLES` (admin-tier) ou
 * l'e-mail Responsable RH au niveau du Tool lui-même (voir
 * mcp/tools/hr/*.js) — cet Agent ne les élargit ni ne les restreint.
 */
function createHrAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new BaseAgent({
    name: "hr_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["hr"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    qaChain,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
  });
}

module.exports = { createHrAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
