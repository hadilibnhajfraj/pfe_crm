"use strict";

const { BaseAgent } = require("./baseAgent");

const SYSTEM_PROMPT = [
  "Tu es l'Agent de recherche documentaire du CRM CBI Tunisia.",
  "Tu réponds UNIQUEMENT à partir de la documentation, des guides, de la FAQ",
  "et de l'architecture indexés (jamais des données métier du CRM).",
  'Si la documentation ne contient pas la réponse, dis-le explicitement plutôt',
  "que d'inventer, et cite tes sources par leur numéro entre crochets.",
].join(" ");

/**
 * SearchAgent — prend en charge l'intention `documentation_question`. Aucun
 * Tool autorisé : c'est délibérément le seul rôle de cet Agent — répondre
 * via le RAG (`qaChain`/`RagContextBuilder`), qui lui-même ne lit jamais les
 * données métier du CRM (voir rag/sourceGuard.js et
 * test/ai.rag.policy.test.js) — distinct d'`AssistantAgent` qui gère le
 * repli général (`general_chat`) plutôt que les questions documentaires
 * ciblées.
 *
 * **Plus câblé par défaut** (`agents/manifest.js`) depuis l'introduction du
 * "CRM Assistant" (`crmAssistantAgent.js`, voir `CRM_ASSISTANT.md`), qui
 * gère désormais `documentation_question` avec une vraie base de
 * connaissances produit plutôt qu'un prompt de recherche générique — code
 * conservé (mécaniquement identique, réutilisable comme point de départ
 * pour un futur Agent RAG générique distinct) mais retiré du manifeste pour
 * ne pas entrer en conflit avec lui sur la même intention.
 */
function createSearchAgent({ chatModel, tools = [], workflowEngine, qaChain, memory = null, maxHistoryMessages, promptInjectionGuard = null }) {
  return new BaseAgent({
    name: "search_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["documentation_question"],
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

module.exports = { createSearchAgent, SYSTEM_PROMPT };
