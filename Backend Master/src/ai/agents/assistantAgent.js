"use strict";

const { BaseAgent } = require("./baseAgent");

const SYSTEM_PROMPT = [
  "Tu es l'Assistant général du CRM CBI Tunisia.",
  "Tu réponds aux questions générales de l'utilisateur, orientes-le vers le bon",
  "module (Projets, Pipeline, Maintenance, RH, ...) et expliques le fonctionnement",
  "du CRM à partir de la documentation disponible.",
  "Tu ne réalises toi-même aucune action métier (pas d'accès aux Tools) : pour",
  "une action concrète, indique clairement à l'utilisateur quel module ou Agent",
  "peut la réaliser.",
].join(" ");

/**
 * AssistantAgent — concierge général, prend en charge l'intention
 * `general_chat` (repli par défaut d'IntentDetector — voir
 * orchestrator/intentCatalog.js). Aucun Tool autorisé (`allowedToolNames: []`)
 * : répond exclusivement via le RAG (`qaChain`), jamais d'action métier — un
 * message trop générique pour être rattaché à un module ne doit jamais
 * déclencher une action au hasard.
 */
function createAssistantAgent({ chatModel, tools = [], workflowEngine, qaChain, memory = null, maxHistoryMessages, promptInjectionGuard = null }) {
  return new BaseAgent({
    name: "assistant_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["general_chat"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: [],
    workflowEngine,
    qaChain,
    memory,
    maxHistoryMessages,
    promptInjectionGuard,
  });
}

module.exports = { createAssistantAgent, SYSTEM_PROMPT };
