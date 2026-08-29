"use strict";

const { BaseAgent } = require("./baseAgent");

// Les 6 Tools du module Pipeline (voir mcp/tools/pipeline/).
const ALLOWED_TOOL_NAMES = [
  "list_pipeline_stages",
  "get_pipeline_stage",
  "create_pipeline_stage",
  "update_pipeline_stage",
  "delete_pipeline_stage",
  "reorder_pipeline_stages",
];

const SYSTEM_PROMPT = [
  "Tu es l'Agent Pipeline commercial du CRM CBI Tunisia.",
  "Tu aides à consulter, créer, modifier, réordonner ou supprimer les étapes",
  "du pipeline commercial, exclusivement via les Tools fournis.",
  "Avant une suppression ou un réordonnancement, résume clairement l'action",
  "prévue.",
].join(" ");

/**
 * PipelineAgent — prend en charge l'intention `pipeline`. Permissions
 * laissées ouvertes au niveau de l'Agent (accès mixte au niveau des Tools :
 * lecture ouverte à tout authentifié, écriture réservée à
 * admin/superadmin/superadmin2 — voir mcp/tools/pipeline/).
 */
function createPipelineAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new BaseAgent({
    name: "pipeline_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["pipeline"],
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

module.exports = { createPipelineAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
