"use strict";

const { loadOrchestratorConfig } = require("./config");
const { NotConfiguredError } = require("./errors");
const { createLangChainPipeline } = require("../langchain/pipeline");
const { InMemoryConversationMemory } = require("../memory");
const { byModule } = require("../mcp/tools");
const { ConversationManager } = require("./conversationManager");
const { createLexicalIntentDetector } = require("./intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("./intentCatalog");
const { ToolRouter } = require("./toolRouter");
const { AgentRouter } = require("./agentRouter");
const { WorkflowManager } = require("./workflowManager");
const { ResponseBuilder } = require("./responseBuilder");
const { AIManager } = require("./aiManager");
const { ConversationContextResolver } = require("./conversationContextResolver");
const { ConversationContinuityResolver } = require("./conversationContinuityResolver");
const { SuggestionEngine } = require("./suggestionEngine");
const { PendingActionStore } = require("./pendingActionStore");
const { TaskPlanner } = require("../planning/taskPlanner");
const { ConfirmationManager } = require("../planning/confirmationManager");
const { AnalyticsQueryParser } = require("../analytics/analyticsQueryParser");
const { QueryRouter } = require("../routing/queryRouter");
const { AgentRegistry, loadDefaultAgents } = require("../agents");
const { extractEntities } = require("./entityExtractor");
const { ContextManager } = require("./contextManager");
const { SemanticIntentResolver } = require("./semanticIntentResolver");

// Builds the toolName -> moduleKey lookup ToolRouter needs to restrict
// candidate tools to the module an Intent points at. Reuses the exact same
// manifest ToolLoader uses to populate the real MCP ToolRegistry
// (mcp/tools/index.js::byModule) rather than re-deriving module boundaries
// by parsing tool names — a single source of truth for "which module does
// this tool belong to". Building each tool via its factory is pure (no I/O,
// see tools/serviceBackedTool.js) so doing it twice (once here, once when
// ToolLoader populates the real McpServer) costs nothing and risks nothing.
function buildToolModuleIndex() {
  const index = new Map();
  for (const [moduleName, mod] of Object.entries(byModule)) {
    for (const factory of mod.toolFactories) {
      index.set(factory().name, moduleName);
    }
  }
  return index;
}

// Même construction que buildToolModuleIndex() ci-dessus, mais pour
// requiredRoles/allowedEmails plutôt que le module — consommé par
// SuggestionEngine (suggestionEngine.js) pour résoudre la permission d'une
// suggestion adossée à un vrai Tool MCP SANS dupliquer cette règle dans
// suggestionCatalog.js (une seule source de vérité : le Tool lui-même).
function buildToolPermissionIndex() {
  const index = new Map();
  for (const mod of Object.values(byModule)) {
    for (const factory of mod.toolFactories) {
      const tool = factory();
      index.set(tool.name, { requiredRoles: tool.requiredRoles || [], allowedEmails: tool.allowedEmails || [] });
    }
  }
  return index;
}

/**
 * Composition root for the orchestration layer (mirrors manager/index.js,
 * mcp/server/start.js::createServer(), rag/pipeline.js and
 * langchain/pipeline.js): wires ConversationManager, IntentDetector,
 * AgentRouter, ToolRouter, WorkflowManager and ResponseBuilder into one
 * `AIManager`.
 *
 * Requires everything a real conversation turn needs — `llmProvider` and
 * `retriever` (passed straight through to `createLangChainPipeline`),
 * `mcpServer` and `actingUser` (so ToolRouter/WorkflowManager have real
 * Tools to choose among and call, scoped to that one CRM identity — see
 * langchain/tools/mcpToolAdapter.js). Unlike the RAG pipeline, there is no
 * safe default here: same reasoning as `createLangChainPipeline` (a Chain
 * with no real model is meaningless), so this factory throws
 * `NotConfiguredError` rather than silently building a half-working
 * orchestrator, and it stays un-wired from `createDefaultAiManager()`.
 *
 * `memory` defaults to a fresh `InMemoryConversationMemory` shared between
 * `ConversationManager` (writes each turn) and the LangChain Context
 * Builder (reads history for RAG-grounded answers) — passing your own
 * instance keeps both readers/writers in sync with a persistent adapter
 * later, without changing any other wiring here.
 *
 * Unless an explicit `agentRegistry` is passed, this factory builds one and
 * registers the 11 specialized Agents (agents/manifest.js::loadDefaultAgents)
 * by default — every collaborator they need (`chatModel`, `tools`,
 * `workflowEngine`, `qaChain`, `summarizationChain`, `planner`, the shared
 * `memory`) already exists at this point in the wiring, from
 * `langChainPipeline`. Set `includeSpecializedAgents: false` to get the
 * pre-Agents behavior back (every intent falls through to `WorkflowManager`
 * — useful for a caller that wants to run its own, different set of Agents).
 *
 * `promptInjectionGuard` (security/promptInjectionGuard.js), optional, is
 * the ONE shared instance applied consistently at every prompt-injection
 * surface in this kernel: `AIManager` (raw user message), `RagContextBuilder`
 * (RAG-retrieved content, via `createLangChainPipeline`), `WorkflowManager`
 * and every specialized Agent's `ToolCallingChain` (a Tool's RESULT — e.g. a
 * free-text CRM field returned by a Tool call — before it's fed back into
 * the next model turn; found missing in a later security audit and closed
 * here rather than only at the two originally-identified surfaces), and
 * `BaseAgent._historyText` (conversation history re-injected into a prompt).
 *
 * `auditLog` (security/auditLog.js), optional, flows straight to `AIManager`
 * — logs every conversation turn ("étape 12" of the requested 12-step
 * workflow, see aiManager.js's own doc comment), independently of
 * `McpServer`'s own per-Tool-call audit trail. Pass the same `AuditLog`
 * instance already built by `security/pipeline.js::createSecurityPipeline()`
 * to share one audit trail across the whole kernel.
 *
 * Le TON de réponse (voir `langchain/prompts/responsePrompts.js` et
 * `RESPONSE_PROMPTS.md`) est dérivé automatiquement de `actingUser.role` —
 * `createLangChainPipeline` en tient déjà compte pour `qaChain` (son propre
 * défaut interne), et `role: actingUser.role` est transmis explicitement au
 * `WorkflowManager` construit ici pour son propre `ToolCallingChain`.
 * NON encore propagé aux 11 Agents spécialisés (chacun garde son
 * `SYSTEM_PROMPT` fixe par domaine, une décision antérieure à cette
 * fonctionnalité) — voir RESPONSE_PROMPTS.md, section « Ce qui n'a pas
 * encore été fait ».
 *
 * Mémoriser le contexte (références/reformulations, voir
 * `conversationContextResolver.js`/`CONVERSATION_CONTEXT.md`) est activé PAR
 * DÉFAUT (`enableContextResolution: true`) — construit avec le MÊME
 * `intentCatalog` que le reste de ce pipeline, pour qu'un catalogue
 * personnalisé reste cohérent d'un bout à l'autre. `contextResolver`
 * (explicite) prend le pas s'il est fourni ; `enableContextResolution:
 * false` désactive entièrement le mécanisme (comportement d'avant cette
 * fonctionnalité).
 *
 * Continuité conversationnelle (AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md,
 * `conversationContinuityResolver.js`) — même politique par défaut
 * (`enableConversationContinuity: true`, même `intentCatalog`,
 * `continuityResolver` explicite prend le pas, `false` désactive
 * entièrement le mécanisme).
 *
 * Smart Suggestions (voir `suggestionEngine.js`/`SMART_SUGGESTIONS.md`) :
 * `SuggestionEngine` est construit ici avec `toolPermissionIndex`
 * (`buildToolPermissionIndex()`, même manifeste `mcp/tools` que
 * `buildToolModuleIndex()` ci-dessus — une seule lecture des Tools réels,
 * jamais une copie de leurs `requiredRoles`) et transmis à
 * `loadDefaultAgents` comme n'importe quel autre collaborateur — SEUL
 * `ProjectAgent` le consomme à ce jour (voir sa propre doc).
 *
 * `pendingActionStore` (`pendingActionStore.js`) : l'état "proposé, en
 * attente de confirmation" d'`AutomationAgent` (voir sa doc et
 * `AUTOMATION_WORKFLOWS.md`) — construit ici UNE SEULE FOIS (comme
 * `suggestionEngine`), pour que la proposition faite à un tour survive
 * jusqu'au tour de confirmation suivant sur le même `conversationId`.
 * Reconstruire un `AutomationAgent` (ou tout l'orchestrateur) à chaque appel
 * effacerait toute proposition en attente — ce collaborateur doit rester
 * stable pour la durée de vie du process, exactement comme `sharedMemory`.
 */
function createEngineerProbe(tools) {
  const tool = (tools || []).find((t) => t.name === "find_crm_entity");
  if (!tool) return null;
  return async (name) => {
    try {
      const raw = await tool.invoke({ entityType: "engineer", name, includeDetails: false });
      const output = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Boolean(output && Array.isArray(output.matches) && output.matches.length > 0);
    } catch (_err) {
      return false;
    }
  };
}

// Le nom désigne-t-il une personne du CRM (ingénieur, contact) et/ou un
// projet, dans le périmètre de l'utilisateur ? Toujours via le Tool scopé.
function createEntityProbe(tools) {
  const tool = (tools || []).find((t) => t.name === "find_crm_entity");
  if (!tool) return null;
  const call = async (input) => {
    try {
      const raw = await tool.invoke(input);
      const output = typeof raw === "string" ? JSON.parse(raw) : raw;
      return output && Array.isArray(output.matches) ? output.matches : [];
    } catch (_err) {
      return [];
    }
  };
  return async (name) => {
    const [entities, projects] = await Promise.all([
      call({ entityType: "auto", name, includeDetails: false }),
      call({ entityType: "project_promoter", projectName: name }),
    ]);
    return {
      person: entities.some((m) => m.entityType === "engineer" || m.entityType === "architect" || m.entityType === "contact"),
      company: entities.some((m) => m.entityType === "company"),
      project: projects.length > 0,
    };
  };
}

function createAiOrchestrator({
  llmProvider,
  retriever,
  mcpServer,
  actingUser,
  memory = null,
  agentRegistry = null,
  includeSpecializedAgents = true,
  intentCatalog = DEFAULT_INTENT_CATALOG,
  promptInjectionGuard = null,
  auditLog = null,
  contextResolver = null,
  enableContextResolution = true,
  continuityResolver = null,
  enableConversationContinuity = true,
  // AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md —
  // MeetingAgent a besoin de créer une réunion CRM+Google (Task ->
  // create_calendar_event -> CalendarEventSync, voir
  // meetingCopilotSync.service.js), mais RIEN sous src/ai/ (agents/ ET
  // orchestrator/, voir test/ai.agents.policy.test.js et
  // test/ai.orchestrator.policy.test.js) n'a le droit de require() un
  // service CRM directement — ce fichier ne le fait donc PAS lui-même : le
  // VRAI appelant (aiCopilotBridge.service.js, hors de src/ai/) le require
  // et l'injecte ici, exactement comme llmProvider/retriever/mcpServer.
  createCopilotMeeting = null,
  // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — même discipline
  // que createCopilotMeeting ci-dessus : `middleware/moduleAccessGuard.js`
  // vit hors de `src/ai/`, donc jamais require() directement ici — le VRAI
  // appelant (aiCopilotBridge.service.js) le require et l'injecte. `{}` par
  // défaut : RoleCapabilityAuditAgent répond alors "aucune restriction
  // connue" pour tout rôle, jamais une exception ni une donnée inventée.
  moduleAccessByRole = {},
  // Phase 1 — compréhension naturelle (voir entityExtractor.js,
  // contextManager.js, semanticIntentResolver.js). Activée par défaut ;
  // `false` rend le comportement strictement identique à l'avant-Phase 1.
  enableNaturalUnderstanding = true,
  contextManager = null,
  // Phase 2 — documents joints au Copilot (src/ai/rag/userDocumentService.js),
  // injecté par le bridge ; `null` : DocumentAgent répond que l'analyse de
  // documents n'est pas disponible.
  userDocumentService = null,
  env = process.env,
} = {}) {
  if (!llmProvider) {
    throw new NotConfiguredError("createAiOrchestrator requires an ILlmProvider (llmProvider)");
  }
  if (!retriever) {
    throw new NotConfiguredError("createAiOrchestrator requires an IRetriever (retriever)");
  }
  if (!mcpServer) {
    throw new NotConfiguredError("createAiOrchestrator requires a McpServer (mcpServer)");
  }
  if (!actingUser) {
    throw new NotConfiguredError("createAiOrchestrator requires an actingUser");
  }

  const config = loadOrchestratorConfig(env);
  const sharedMemory = memory || new InMemoryConversationMemory();

  const langChainPipeline = createLangChainPipeline({ llmProvider, retriever, memory: sharedMemory, mcpServer, actingUser, promptInjectionGuard, env });

  const conversationManager = new ConversationManager({ memory: sharedMemory, maxHistoryMessages: config.maxHistoryMessages });
  const intentDetector = createLexicalIntentDetector({ catalog: intentCatalog, defaultIntentKey: config.defaultIntent });

  // Construits UNE SEULE FOIS (jamais recalculés) — déjà consommés par
  // SuggestionEngine/ToolRouter ci-dessous ; RoleCapabilityAuditAgent
  // (AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md) réutilise ces
  // MÊMES index plutôt que d'en reconstruire une troisième copie.
  const toolPermissionIndex = buildToolPermissionIndex();
  const toolModuleIndex = buildToolModuleIndex();

  const suggestionEngine = new SuggestionEngine({ toolPermissionIndex });
  const pendingActionStore = new PendingActionStore();
  // Phase 3 — planification multi-étapes : même PendingActionStore partagé.
  const taskPlanner = new TaskPlanner();
  const confirmationManager = new ConfirmationManager({ store: pendingActionStore });
  // Analytique CRM : un seul parseur, partagé par l'AIManager (routage) et l'AnalyticsAgent.
  const analyticsParser = new AnalyticsQueryParser();
  // Personne / société / promoteur précis : un seul routeur, partagé par
  // l'AIManager (routage) et l'EntityLookupAgent.
  const queryRouter = new QueryRouter();

  let resolvedAgentRegistry = agentRegistry;
  if (!resolvedAgentRegistry && includeSpecializedAgents) {
    // Créé explicitement (jamais inline) : RoleCapabilityAuditAgent a besoin
    // d'une référence vers CE registre pour interroger les 16 autres Agents
    // déjà enregistrés — jamais lue avant la fin de loadDefaultAgents() ici,
    // donc aucun souci d'ordre malgré l'auto-référence.
    const registry = new AgentRegistry();
    resolvedAgentRegistry = loadDefaultAgents(registry, {
      chatModel: langChainPipeline.chatModel,
      tools: langChainPipeline.tools,
      workflowEngine: langChainPipeline.workflowEngine,
      qaChain: langChainPipeline.qaChain,
      summarizationChain: langChainPipeline.summarizationChain,
      planner: langChainPipeline.planner,
      memory: sharedMemory,
      maxToolCalls: langChainPipeline.config.maxToolCalls,
      maxHistoryMessages: config.maxHistoryMessages,
      promptInjectionGuard,
      suggestionEngine,
      pendingActionStore,
      createCopilotMeeting,
      agentRegistry: registry,
      intentCatalog,
      toolPermissionIndex,
      toolModuleIndex,
      moduleAccessByRole,
      userDocumentService,
      taskPlanner,
      confirmationManager,
      analyticsParser,
      queryRouter,
    });
  }
  const agentRouter = new AgentRouter({ agentRegistry: resolvedAgentRegistry });
  const toolRouter = new ToolRouter({
    tools: langChainPipeline.tools,
    toolModuleIndex,
    maxTools: config.maxCandidateTools,
  });
  const workflowManager = new WorkflowManager({
    chatModel: langChainPipeline.chatModel,
    qaChain: langChainPipeline.qaChain,
    workflowEngine: langChainPipeline.workflowEngine,
    maxToolCalls: langChainPipeline.config.maxToolCalls,
    promptInjectionGuard,
    role: actingUser.role,
  });
  const responseBuilder = new ResponseBuilder();
  const resolvedContextResolver =
    contextResolver || (enableContextResolution ? new ConversationContextResolver({ catalog: intentCatalog }) : null);
  const resolvedContinuityResolver =
    continuityResolver || (enableConversationContinuity ? new ConversationContinuityResolver({ catalog: intentCatalog }) : null);

  // Repli sémantique : le LlmIntentRouter EXISTANT (langchain/router), contraint
  // aux clés du catalogue ; toute réponse invalide retombe sur general_chat.
  let semanticResolver = null;
  let resolvedContextManager = null;
  if (enableNaturalUnderstanding) {
    const llmRouter = config.intentLlmFallback
      ? langChainPipeline.createLlmRouter(
          intentCatalog.map((entry) => ({ key: entry.key, description: entry.description || entry.key })),
          { route: async () => "general_chat" }
        )
      : null;
    semanticResolver = new SemanticIntentResolver({ catalog: intentCatalog, llmRouter, llmTimeoutMs: config.intentLlmTimeoutMs });
    resolvedContextManager = contextManager || new ContextManager();
  }

  const aiManager = new AIManager({
    conversationManager,
    intentDetector,
    agentRouter,
    toolRouter,
    workflowManager,
    responseBuilder,
    promptInjectionGuard,
    auditLog,
    contextResolver: resolvedContextResolver,
    continuityResolver: resolvedContinuityResolver,
    pendingActionStore,
    intentCatalog,
    entityExtractor: enableNaturalUnderstanding ? extractEntities : null,
    contextManager: resolvedContextManager,
    semanticResolver,
    taskPlanner,
    analyticsParser,
    queryRouter,
    // « Les projets de X » sans le mot « ingénieur » : X est-il un ingénieur du
    // CRM ? Vérifié par le Tool scopé (jamais par un accès direct au CRM).
    engineerProbe: createEngineerProbe(langChainPipeline.tools),
    entityProbe: createEntityProbe(langChainPipeline.tools),
  });

  return {
    config,
    memory: sharedMemory,
    langChainPipeline,
    conversationManager,
    intentDetector,
    agentRegistry: resolvedAgentRegistry,
    agentRouter,
    toolRouter,
    workflowManager,
    responseBuilder,
    suggestionEngine,
    pendingActionStore,
    contextManager: resolvedContextManager,
    semanticResolver,
    aiManager,
  };
}

module.exports = { createAiOrchestrator, buildToolModuleIndex, buildToolPermissionIndex };
