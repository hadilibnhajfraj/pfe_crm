"use strict";

const { BaseAgent } = require("./baseAgent");

// Les 15 Tools du module Maintenance (voir mcp/tools/maintenance/) — le plus
// grand module métier ; c'est justement pour un module de cette taille que
// ToolRouter/ToolCallingChain classent par pertinence lexicale plutôt que de
// présenter les 15 descriptions au modèle sans discrimination (même
// raisonnement que orchestrator/toolRouter.js).
const ALLOWED_TOOL_NAMES = [
  "create_maintenance_request",
  "get_maintenance_request",
  "list_my_maintenance_requests",
  "list_all_maintenance_requests",
  "add_maintenance_comment",
  "list_maintenance_comments",
  "get_maintenance_history",
  "accept_maintenance_request",
  "reject_maintenance_request",
  "start_maintenance_request",
  "complete_maintenance_request",
  "assign_maintenance_technician",
  "list_maintenance_technicians",
  "get_maintenance_stats",
  "delete_maintenance_request",
];

const SYSTEM_PROMPT = [
  "Tu es l'Agent Maintenance du CRM CBI Tunisia.",
  "Tu aides à créer, suivre, commenter et faire progresser les demandes de",
  "maintenance (acceptation, démarrage, affectation d'un technicien,",
  "complétion), exclusivement via les Tools fournis.",
  "Demande toujours l'identifiant de la demande de maintenance si l'utilisateur",
  "ne l'a pas fourni et qu'il ne s'agit pas d'une création.",
].join(" ");

/**
 * MaintenanceAgent — prend en charge l'intention `maintenance`. Permissions
 * laissées ouvertes au niveau de l'Agent : `create_maintenance_request`,
 * `list_my_maintenance_requests`, les commentaires et l'historique sont
 * ouverts à tout employé authentifié, tandis que les actions de gestion
 * (accepter/rejeter/démarrer/compléter/affecter/supprimer) exigent déjà le
 * rôle ou l'e-mail du responsable maintenance au niveau du Tool lui-même
 * (voir mcp/tools/maintenance/, `MAINTENANCE_MANAGER_ROLES`/`_EMAIL`).
 */
function createMaintenanceAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new BaseAgent({
    name: "maintenance_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["maintenance"],
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

module.exports = { createMaintenanceAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
