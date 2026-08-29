"use strict";

const { AiManager } = require("./aiManager");
const { loadAiConfig } = require("../config");
const { InMemoryEventBus } = require("../events");
const { InMemoryConversationMemory } = require("../memory");
const { InMemoryPromptRepository } = require("../prompts");
const { ToolRegistry } = require("../tools");
const { WorkflowRunner } = require("../workflows");
const { AgentRegistry } = require("../agents");
const { createRagPipeline } = require("../rag/pipeline");
const { DEFAULT_CORPUS_ROOTS } = require("../rag/reindex");
const { createLlmProvider } = require("../services/providers");
const { withNamespace } = require("../utils/logger");

const logger = withNamespace("config");

// Wires the generic, non-business adapters built in this kernel.
// agents/mcp (client-side)/guardrails/contextBuilder are left unset on
// purpose — see AiManager and AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md
// ("Ne développer aucun Agent"). `retriever`/`vectorStore` ARE wired now
// that a full RAG implementation exists behind IRetriever (see ../rag) —
// constructing the pipeline performs no I/O and ingests nothing by itself,
// so this stays safe to call unconditionally: with AI_COPILOT_ENABLED
// unset/false, isEnabled() is false and isRoleAllowed() always returns
// false, and even once enabled the retriever's vector store starts empty
// until something explicitly calls
// ragPipeline.ingestionService.ingestDirectories(...) (see ../rag/reindex.js).
// `llmProvider` IS also wired now (see ../services/providers) — `null` when
// AI_LLM_PROVIDER/MODEL/API_KEY aren't all set (same "absent => inert"
// rule), a real OpenAI/Anthropic adapter otherwise. An unrecognised
// AI_LLM_PROVIDER value throws ConfigurationError here, at boot — a typo in
// this variable is a misconfiguration worth failing loudly on immediately,
// not a Copilot that silently answers nothing later.
function createDefaultAiManager(env = process.env) {
  const config = loadAiConfig(env);
  const ragPipeline = createRagPipeline({ allowedRoots: DEFAULT_CORPUS_ROOTS, env });
  const llmProvider = createLlmProvider(config.llm);

  // [AI-COPILOT-CONFIG] — booleans only, NEVER the key/model/provider name
  // themselves (a provider or model name is not secret, but keeping this
  // strictly boolean makes it impossible to ever regress into leaking one
  // by accident). Answers, from `pm2 logs` alone, the exact question this
  // log line exists for: "is AI_LLM_PROVIDER/MODEL/API_KEY really all
  // three present in THIS process's environment" — the real cause of a
  // "Le Copilot IA n'est pas configuré côté serveur." (503,
  // copilot_not_configured) response is always exactly one of these three
  // being false, see aiCopilot.controller.js::handle().
  logger.info(
    `[AI-COPILOT-CONFIG] enabled=${config.enabled} providerConfigured=${Boolean(config.llm.provider)} modelConfigured=${Boolean(config.llm.model)} apiKeyConfigured=${Boolean(config.llm.apiKey)} llmProviderWired=${Boolean(llmProvider)}`
  );

  return new AiManager({
    config,
    eventBus: new InMemoryEventBus(),
    memory: new InMemoryConversationMemory(),
    promptRepository: new InMemoryPromptRepository(),
    toolRegistry: new ToolRegistry(),
    workflowRunner: new WorkflowRunner(),
    agentRegistry: new AgentRegistry(),
    retriever: ragPipeline.retrievalService,
    vectorStore: ragPipeline.vectorStore,
    llmProvider,
  });
}

module.exports = { AiManager, createDefaultAiManager };
