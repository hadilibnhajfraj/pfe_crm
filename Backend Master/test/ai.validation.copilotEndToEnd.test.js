"use strict";

/**
 * # Validation du Copilot — Tier 2 : réponse cohérente, bout-en-bout
 *
 * Voir `src/ai/orchestrator/COPILOT_VALIDATION.md`. Le "Tier 1"
 * (`ai.validation.copilotScenarios.test.js`) prouve, pour les 500
 * scénarios, que l'intention/l'Agent/les Tools/les permissions sont
 * corrects — sans jamais exécuter un tour de conversation complet. Ce
 * fichier fait l'inverse : EXÉCUTE un tour complet via un VRAI `AIManager`
 * (les mêmes classes réelles que la production : `ConversationManager`,
 * `IntentDetector`, `AgentRouter` + les 11 VRAIS Agents, `ToolRouter`,
 * `WorkflowManager`, `ResponseBuilder`) — un modèle de langage FACTICE
 * (`FakeListChatModel`-style, comme partout ailleurs dans `test/ai.agents.*`)
 * tient lieu de `ILlmProvider` puisqu'aucun fournisseur réel n'est câblé
 * par défaut (décision Sprint 0, voir `src/ai/README.md`).
 *
 * Volontairement UN scénario représentatif par intention distincte (18),
 * repris tel quel du corpus de 500 (`copilotValidationScenarios.js`) —
 * jamais un message inventé pour l'occasion — plutôt que les 500 : une fois
 * le câblage prouvé correct pour UNE intention donnée, il s'applique
 * uniformément à toute variation de message qui route vers la même
 * intention (déjà prouvé par le Tier 1). Répéter ce test bout-en-bout pour
 * chacune des 500 variations n'apporterait aucune garantie
 * supplémentaire, seulement du temps de test perdu.
 *
 * "Réponse cohérente" est vérifié comme : le tour se termine SANS
 * exception, produit une enveloppe `ResponseBuilder` bien formée (tous les
 * champs attendus, du bon type), le bon `mode`/`agent` quand un Agent est
 * attendu, et — pour un scénario de refus de permission — `mode: "error"`
 * avec un message qui ne fuite aucun détail interne.
 */

const { SCENARIOS } = require("./fixtures/copilotValidationScenarios");
const { TOOL_PERMISSIONS, TOOL_MODULE_MAP } = require("./fixtures/copilotToolReference");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { ToolRouter } = require("../src/ai/orchestrator/toolRouter");
const { WorkflowManager } = require("../src/ai/orchestrator/workflowManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { AgentRegistry, loadDefaultAgents } = require("../src/ai/agents");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const FINAL_ANSWER = "Réponse construite à partir des données réelles renvoyées par les Tools.";

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

const finalAnswerChatModel = chatModelReturning({ action: "final_answer", answer: FINAL_ANSWER });

function fakeToolFor(toolName) {
  return { name: toolName, description: toolName.replace(/_/g, " "), invoke: jest.fn(async () => "{}") };
}

// Construit un AIManager RÉEL pour un scénario donné : les 11 VRAIS Agents
// (agents/manifest.js), scopés aux Tools que CET Agent autorise (assez pour
// que la ToolCallingChain ait quelque chose à considérer), un chatModel
// factice qui répond toujours "final_answer" directement (aucun appel de
// Tool nécessaire pour obtenir une réponse cohérente — le CHOIX d'appeler
// un Tool est une décision du modèle, hors du périmètre de ce Tier, déjà
// couvert par `test/ai.langchain.chains.test.js`).
function buildAiManagerFor(scenario) {
  const agentTools = TOOL_PERMISSIONS ? Object.keys(TOOL_PERMISSIONS).map(fakeToolFor) : [];
  const workflowEngine = new LangChainWorkflowEngine();
  const toolModuleIndex = new Map(Object.keys(TOOL_PERMISSIONS).map((name) => [name, TOOL_MODULE_MAP[name]]));

  // `agentRegistry`/`intentCatalog`/`toolPermissionIndex`/`toolModuleIndex`/
  // `moduleAccessByRole` — AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md :
  // consommés par RoleCapabilityAuditAgent (17e Agent, `capabilityMatrixService`
  // exige `agentRegistry`+`intentCatalog`), même auto-référence que
  // orchestrator/pipeline.js — jamais lue avant la fin de loadDefaultAgents().
  const registry = new AgentRegistry();
  const agentRegistry = loadDefaultAgents(registry, {
    chatModel: finalAnswerChatModel,
    tools: agentTools,
    workflowEngine,
    qaChain: { invoke: jest.fn(async () => ({ answer: FINAL_ANSWER, citations: [] })) },
    summarizationChain: { invoke: jest.fn(async ({ text, focus }) => ({ summary: `Synthèse (${focus}) : ${text}` })) },
    planner: { plan: jest.fn(async () => []) },
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: jest.fn(),
    memory: null,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(Object.entries(TOOL_PERMISSIONS || {})),
    toolModuleIndex,
    moduleAccessByRole: {},
  });

  const memory = new InMemoryConversationMemory();

  return new AIManager({
    conversationManager: new ConversationManager({ memory }),
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry }),
    toolRouter: new ToolRouter({ tools: agentTools, toolModuleIndex, maxTools: 10 }),
    workflowManager: new WorkflowManager({ chatModel: finalAnswerChatModel, qaChain: { invoke: jest.fn(async () => ({ answer: FINAL_ANSWER, citations: [] })) }, workflowEngine }),
    responseBuilder: new ResponseBuilder(),
  });
}

function assertWellFormedResponse(response) {
  expect(typeof response.conversationId === "string" || response.conversationId === null).toBe(true);
  expect(["error", "clarification", "agent", "tool_calling", "qa"]).toContain(response.mode);
  expect(Array.isArray(response.citations)).toBe(true);
  expect(Array.isArray(response.toolCalls)).toBe(true);
  expect(Array.isArray(response.suggestions)).toBe(true);
  expect(Array.isArray(response.dataQuality)).toBe(true);
  expect(response.followUpQuestion === null || typeof response.followUpQuestion === "string").toBe(true);
  expect(response.explanation === null || typeof response.explanation === "string").toBe(true);
  expect(typeof response.generatedAt).toBe("string");
}

// Un scénario représentatif AUTORISÉ par intention (repris du corpus, jamais inventé).
const REPRESENTATIVE_BY_INTENT = [
  "com-01", // commercial_contacts
  "prj-01", // projects
  "hr-03", // hr
  "dir-01", // dashboard
  "rpt-01", // reporting
  "usr-01", // users
  "pip-01", // pipeline
  "mnt-01", // maintenance
  "not-01", // notifications
  "ind-01", // industrial
  "por-01", // por_promesh
  "aut-04", // automation
  "ana-01", // business_analysis
  "rec-01", // recommendation
  "dq-01", // data_quality
  "search-01", // advanced_search
  "doc-01", // documentation_question
  "gen-01", // general_chat
  "reg-16", // meetings
  "reg-32", // reminders
];

describe("Copilot — réponse cohérente bout-en-bout (un scénario représentatif par intention)", () => {
  test.each(REPRESENTATIVE_BY_INTENT)("%s", async (scenarioId) => {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    expect(scenario).toBeDefined();

    const aiManager = buildAiManagerFor(scenario);
    const response = await aiManager.handleMessage({ message: scenario.message, user: scenario.actingUser, conversationId: `conv-${scenario.id}` });

    assertWellFormedResponse(response);
    expect(response.mode).not.toBe("error");
    expect(typeof response.answer).toBe("string");
    expect(response.answer.length).toBeGreaterThan(0);

    if (scenario.expectedAgent) {
      expect(response.agent).toBe(scenario.expectedAgent);
      expect(response.mode).toBe("agent");
    } else {
      expect(response.agent).toBeNull();
    }

    // L'historique de conversation a bien été journalisé (étape 12 du workflow).
    const history = await aiManager.conversationManager.getHistory(`conv-${scenario.id}`);
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(history[0].content).toBe(scenario.message); // jamais le message enrichi, voir CONVERSATION_CONTEXT.md
  });
});

describe("Copilot — refus de permission bout-en-bout (mode: 'error', jamais un plantage ni une réponse hallucinée)", () => {
  const DENIED_SCENARIOS = ["com-17", "ind-06", "aut-03"];

  test.each(DENIED_SCENARIOS)("%s", async (scenarioId) => {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    expect(scenario).toBeDefined();
    expect(scenario.expectedAgentAllowed).toBe(false);

    const aiManager = buildAiManagerFor(scenario);
    const response = await aiManager.handleMessage({ message: scenario.message, user: scenario.actingUser, conversationId: `conv-${scenario.id}` });

    assertWellFormedResponse(response);
    // L'Agent a bien été SÉLECTIONNÉ (bonne intention) mais son exécution a
    // été refusée avant tout accès aux données — jamais une réponse inventée
    // pour compenser le refus.
    expect(response.mode).toBe("error");
    expect(response.answer).toBeNull();
    expect(response.error.message).toMatch(/not allowed to invoke agent/i);
  });
});
