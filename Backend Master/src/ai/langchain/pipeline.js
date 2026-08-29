"use strict";

const { loadLangChainConfig } = require("./config");
const { NotConfiguredError } = require("./errors");
const { LlmProviderChatModel } = require("./model");
const { RagContextBuilder } = require("./context");
const { QaChain, SummarizationChain, ToolCallingChain } = require("./chains");
const { LlmPlanner } = require("./planner");
const { LexicalIntentRouter, LlmIntentRouter } = require("./router");
const { LangChainWorkflowEngine } = require("./workflow");
const { createMcpToolAdapters } = require("./tools");

/**
 * Composition root for the LangChain.js integration layer (mirrors
 * manager/index.js, mcp/server/start.js::createServer(), rag/pipeline.js).
 *
 * Unlike the RAG pipeline, this one has NO safe default: there is no
 * "useful offline LLM" the way HashingEmbeddingProvider is a useful
 * offline embedder — a Chain with no real model just produces meaningless
 * text. So `llmProvider` is required, and this factory is NOT wired into
 * createDefaultAiManager() (see manager/index.js): it stays an explicit,
 * opt-in construction step for whatever delivery layer eventually chooses
 * a Sprint 0 ILlmProvider adapter (plan §13.2), rather than pretending the
 * kernel has AI capability it doesn't have yet.
 *
 * `retriever` is required too (RagContextBuilder needs it) — pass the
 * `retrievalService` from `rag/pipeline.js::createRagPipeline()`.
 * `mcpServer`/`actingUser` are optional: without them, `toolCallingChain`
 * and `tools` are left empty/null (qaChain, summarizationChain and planner
 * work fine without any tool access).
 *
 * `promptInjectionGuard` (security/promptInjectionGuard.js) is optional
 * too, threaded straight through to `RagContextBuilder` — see that class's
 * own doc comment for why RAG-retrieved content is this kernel's primary
 * indirect-prompt-injection surface. Omitting it preserves the exact
 * pre-existing behavior (no scanning, nothing rendered differently).
 *
 * `role` (optionnel) adapte le ton de `qaChain`/`toolCallingChain` (voir
 * `langchain/prompts/responsePrompts.js` et `RESPONSE_PROMPTS.md`) — par
 * défaut, dérivé automatiquement de `actingUser.role` (le rôle CRM réel de
 * l'utilisateur au nom duquel ce pipeline agit), sans qu'un appelant ait à
 * le répéter explicitement. Un rôle CRM non reconnu parmi les 5 tons
 * prédéfinis (ex. `"responsable_logistique_achat"`) n'est pas une erreur :
 * seuls les principes de base de qualité de réponse s'appliquent alors,
 * sans ton dédié.
 */
function createLangChainPipeline({
  llmProvider,
  retriever,
  memory = null,
  mcpServer = null,
  actingUser = null,
  promptInjectionGuard = null,
  role = actingUser && actingUser.role,
  env = process.env,
} = {}) {
  if (!llmProvider) {
    throw new NotConfiguredError("createLangChainPipeline requires an ILlmProvider (llmProvider)");
  }
  if (!retriever) {
    throw new NotConfiguredError("createLangChainPipeline requires an IRetriever (retriever) for its Context Builder");
  }

  const config = loadLangChainConfig(env);
  const chatModel = new LlmProviderChatModel({ llmProvider });
  const contextBuilder = new RagContextBuilder({
    retriever,
    memory,
    maxCitations: config.maxCitations,
    maxHistoryMessages: config.maxHistoryMessages,
    promptInjectionGuard,
  });

  const qaChain = new QaChain({ chatModel, contextBuilder, role });
  const summarizationChain = new SummarizationChain({ chatModel });
  const planner = new LlmPlanner({ chatModel, maxSteps: config.maxPlanSteps });
  const workflowEngine = new LangChainWorkflowEngine();

  let tools = [];
  let toolCallingChain = null;
  if (mcpServer && actingUser) {
    tools = createMcpToolAdapters({ mcpServer, actingUser });
    toolCallingChain = new ToolCallingChain({ chatModel, tools, maxToolCalls: config.maxToolCalls, role });
  }

  return {
    config,
    chatModel,
    contextBuilder,
    qaChain,
    summarizationChain,
    toolCallingChain,
    planner,
    workflowEngine,
    tools,
    createLexicalRouter: (routes, defaultRoute) => new LexicalIntentRouter({ routes, defaultRoute }),
    createLlmRouter: (routes, fallbackRouter) => new LlmIntentRouter({ chatModel, routes, fallbackRouter }),
  };
}

module.exports = { createLangChainPipeline };
