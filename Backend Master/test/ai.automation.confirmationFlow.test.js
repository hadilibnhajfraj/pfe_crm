"use strict";

/**
 * # Automation Agent — le cycle proposer → confirmer/annuler → exécuter, bout-en-bout
 *
 * Voir `src/ai/orchestrator/AUTOMATION_WORKFLOWS.md`. Contrairement aux
 * suites de validation (`ai.validation.copilotScenarios.test.js`/
 * `ai.validation.copilotEndToEnd.test.js`, volontairement mono-tour), ce
 * fichier exécute un VRAI `AIManager` sur DEUX tours de conversation
 * successifs, avec un `PendingActionStore` PARTAGÉ entre les deux appels
 * (exactement comme `orchestrator/pipeline.js` le construit une seule fois
 * pour toute la durée du process) — la seule façon de prouver que
 * l'exécution réelle n'a bien lieu qu'après une confirmation explicite, et
 * jamais avant.
 */

const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { ToolRouter } = require("../src/ai/orchestrator/toolRouter");
const { WorkflowManager } = require("../src/ai/orchestrator/workflowManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { AgentRegistry, loadDefaultAgents } = require("../src/ai/agents");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const ADMIN = { id: "u-admin", role: "admin" };
const USER = { id: "u-generic", role: "user" };

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

// Un planner factice mais réaliste : produit TOUJOURS le même plan à une
// étape, référençant un VRAI nom de Tool — représentatif de ce qu'un vrai
// LlmPlanner produirait pour "crée une activité sur ce projet", sans
// dépendre d'un modèle de langage réel pour ce test.
function singleStepPlanner(tool, input, reason) {
  return { plan: jest.fn(async () => [{ tool, input, reason }]) };
}

function createProjectActionTool(impl) {
  return { name: "create_project_action", description: "d", invoke: jest.fn(impl || (async () => JSON.stringify({ id: "action-1", projectId: "p1" }))) };
}

function buildManager({ planner, tools }) {
  const pendingActionStore = new PendingActionStore();
  const memory = new InMemoryConversationMemory();
  const workflowEngine = new LangChainWorkflowEngine();
  const chatModel = chatModelReturning({ action: "final_answer", answer: "réponse" });

  const registry = new AgentRegistry();
  const agentRegistry = loadDefaultAgents(registry, {
    chatModel,
    tools,
    workflowEngine,
    qaChain: { invoke: jest.fn(async () => ({ answer: "réponse RAG", citations: [] })) },
    summarizationChain: { invoke: jest.fn(async () => ({ summary: "synthèse" })) },
    planner,
    pendingActionStore,
    createCopilotMeeting: jest.fn(),
    memory,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: {},
  });

  const manager = new AIManager({
    conversationManager: new ConversationManager({ memory }),
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry }),
    toolRouter: new ToolRouter({ tools, toolModuleIndex: new Map(), maxTools: 10 }),
    workflowManager: new WorkflowManager({ chatModel, qaChain: { invoke: jest.fn() }, workflowEngine }),
    responseBuilder: new ResponseBuilder(),
  });

  return { manager, pendingActionStore };
}

describe("Automation — proposer puis confirmer : le Tool n'est appelé qu'après confirmation", () => {
  test("tour 1 (proposition) : mode agent, pendingAction rempli, AUCUN appel réel au Tool", async () => {
    const tool = createProjectActionTool();
    const planner = singleStepPlanner("create_project_action", { projectId: "p1", typeAction: "Visite" }, "créer l'activité demandée");
    const { manager } = buildManager({ planner, tools: [tool] });

    const response = await manager.handleMessage({
      message: "Mets en place un workflow pour automatiser la création d'une activité sur ce projet.",
      user: ADMIN,
      conversationId: "conv-1",
    });

    expect(response.mode).toBe("agent");
    expect(response.agent).toBe("automation_agent");
    expect(tool.invoke).not.toHaveBeenCalled();
    expect(response.pendingAction).toEqual({
      id: expect.any(String),
      steps: [{ tool: "create_project_action", input: { projectId: "p1", typeAction: "Visite" }, reason: "créer l'activité demandée" }],
    });
    expect(response.answer).toContain("confirme");
  });

  test("tour 2 (« confirme ») sur la MÊME conversation : le Tool est réellement appelé, exactement une fois", async () => {
    const tool = createProjectActionTool(async () => JSON.stringify({ id: "action-1", projectId: "p1" }));
    const planner = singleStepPlanner("create_project_action", { projectId: "p1", typeAction: "Visite" }, "créer l'activité demandée");
    const { manager } = buildManager({ planner, tools: [tool] });

    await manager.handleMessage({
      message: "Mets en place un workflow pour automatiser la création d'une activité sur ce projet.",
      user: ADMIN,
      conversationId: "conv-1",
    });
    expect(tool.invoke).not.toHaveBeenCalled();

    const response = await manager.handleMessage({ message: "Confirme.", user: ADMIN, conversationId: "conv-1" });

    expect(tool.invoke).toHaveBeenCalledTimes(1);
    expect(tool.invoke).toHaveBeenCalledWith({ projectId: "p1", typeAction: "Visite" });
    expect(response.pendingAction).toBeNull();
    expect(response.answer).toContain("exécutée");
    expect(response.toolCalls).toEqual([{ tool: "create_project_action", input: { projectId: "p1", typeAction: "Visite" }, output: { id: "action-1", projectId: "p1" } }]);
  });

  test("une confirmation sur une AUTRE conversation ne trouve rien à exécuter — jamais de fuite entre conversations", async () => {
    const tool = createProjectActionTool();
    const planner = singleStepPlanner("create_project_action", { projectId: "p1" }, "x");
    const { manager } = buildManager({ planner, tools: [tool] });

    await manager.handleMessage({ message: "Mets en place un workflow pour automatiser la création d'une activité sur ce projet.", user: ADMIN, conversationId: "conv-A" });
    const response = await manager.handleMessage({ message: "Confirme.", user: ADMIN, conversationId: "conv-B" });

    expect(tool.invoke).not.toHaveBeenCalled();
    expect(response.answer).toMatch(/aucune action en attente/i);
  });
});

describe("Automation — proposer puis annuler : jamais aucune exécution", () => {
  test("« Annule. » retire la proposition — le Tool n'est jamais appelé, même après", async () => {
    const tool = createProjectActionTool();
    const planner = singleStepPlanner("create_project_action", { projectId: "p1" }, "créer l'activité demandée");
    const { manager } = buildManager({ planner, tools: [tool] });

    await manager.handleMessage({ message: "Mets en place un workflow pour automatiser la création d'une activité sur ce projet.", user: ADMIN, conversationId: "conv-1" });
    const cancelResponse = await manager.handleMessage({ message: "Annule.", user: ADMIN, conversationId: "conv-1" });

    expect(tool.invoke).not.toHaveBeenCalled();
    expect(cancelResponse.pendingAction).toBeNull();
    expect(cancelResponse.answer).toContain("annulée");

    // Une confirmation tardive après annulation ne ressuscite rien.
    const lateConfirm = await manager.handleMessage({ message: "Confirme.", user: ADMIN, conversationId: "conv-1" });
    expect(tool.invoke).not.toHaveBeenCalled();
    expect(lateConfirm.answer).toMatch(/aucune action en attente/i);
  });
});

describe("Automation — la permission admin-tier reste appliquée AVANT toute proposition", () => {
  test("un rôle standard ne peut ni proposer ni confirmer une automatisation (mode: 'error')", async () => {
    const tool = createProjectActionTool();
    const planner = singleStepPlanner("create_project_action", { projectId: "p1" }, "x");
    const { manager } = buildManager({ planner, tools: [tool] });

    const response = await manager.handleMessage({
      message: "Mets en place un workflow pour automatiser la création d'une activité sur ce projet.",
      user: USER,
      conversationId: "conv-1",
    });

    expect(response.mode).toBe("error");
    expect(tool.invoke).not.toHaveBeenCalled();
  });
});

describe("Automation — la fenêtre de confirmation expire", () => {
  test("une confirmation reçue après le TTL n'exécute rien — la proposition a expiré", async () => {
    const tool = createProjectActionTool();
    const planner = singleStepPlanner("create_project_action", { projectId: "p1" }, "x");

    let currentTime = 1_000_000;
    const pendingActionStore = new PendingActionStore({ ttlMs: 60_000, now: () => currentTime });
    const memory = new InMemoryConversationMemory();
    const workflowEngine = new LangChainWorkflowEngine();
    const chatModel = chatModelReturning({ action: "final_answer", answer: "réponse" });

    const registry = new AgentRegistry();
    const agentRegistry = loadDefaultAgents(registry, {
      chatModel,
      tools: [tool],
      workflowEngine,
      qaChain: { invoke: jest.fn(async () => ({ answer: "x", citations: [] })) },
      summarizationChain: { invoke: jest.fn(async () => ({ summary: "x" })) },
      planner,
      pendingActionStore,
      createCopilotMeeting: jest.fn(),
      memory,
      maxToolCalls: 5,
      maxHistoryMessages: 6,
      agentRegistry: registry,
      intentCatalog: DEFAULT_INTENT_CATALOG,
      toolPermissionIndex: new Map(),
      toolModuleIndex: new Map(),
      moduleAccessByRole: {},
    });

    const manager = new AIManager({
      conversationManager: new ConversationManager({ memory }),
      intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
      agentRouter: new AgentRouter({ agentRegistry }),
      toolRouter: new ToolRouter({ tools: [tool], toolModuleIndex: new Map(), maxTools: 10 }),
      workflowManager: new WorkflowManager({ chatModel, qaChain: { invoke: jest.fn() }, workflowEngine }),
      responseBuilder: new ResponseBuilder(),
    });

    await manager.handleMessage({ message: "Mets en place un workflow pour automatiser la création d'une activité sur ce projet.", user: ADMIN, conversationId: "conv-1" });

    currentTime += 60_001; // au-delà du TTL

    const response = await manager.handleMessage({ message: "Confirme.", user: ADMIN, conversationId: "conv-1" });

    expect(tool.invoke).not.toHaveBeenCalled();
    expect(response.answer).toMatch(/aucune action en attente/i);
  });
});
