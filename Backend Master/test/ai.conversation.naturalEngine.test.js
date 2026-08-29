"use strict";

/**
 * # Natural Conversation Engine — bout-en-bout, avec de VRAIS collaborateurs
 *
 * Voir `src/ai/orchestrator/CONVERSATION_CONTEXT.md`. Contrairement à
 * `test/ai.orchestrator.aiManager.test.js` (qui utilise un `IntentDetector`
 * FACTICE pour isoler le mécanisme de résolution de contexte lui-même), ce
 * fichier utilise le VRAI `IntentDetector`, le VRAI catalogue d'intentions
 * et le VRAI `ProjectAgent` — la seule façon de prouver que l'exemple
 * canonique demandé produit une réponse métier RÉELLE ("voici les projets
 * en retard"), pas seulement un routage correct vers le bon Agent.
 */

const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { ToolRouter } = require("../src/ai/orchestrator/toolRouter");
const { WorkflowManager } = require("../src/ai/orchestrator/workflowManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { AgentRegistry, loadDefaultAgents } = require("../src/ai/agents");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER = { id: "u1", role: "user" };

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

function project(overrides = {}) {
  return {
    id: "p1",
    nomProjet: "Chantier en retard",
    nextRelanceDate: "2020-01-01T00:00:00Z", // largement dépassée => facteur "retard" (ProjectAttentionAnalyzer::scoreRetard)
    montantMarche: 5000,
    pourcentageReussite: 10,
    actionsCount: 0,
    pipelineStageId: null,
    ...overrides,
  };
}

function listProjectsTool(projects) {
  return { name: "list_projects", description: "d", invoke: jest.fn(async () => JSON.stringify({ data: projects, total: projects.length })) };
}

function buildManager({ tools = [], maxHistoryMessages = 20 } = {}) {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory, maxHistoryMessages });
  const workflowEngine = new LangChainWorkflowEngine();
  const chatModel = chatModelReturning({ action: "final_answer", answer: "réponse" });

  const registry = new AgentRegistry();
  const agentRegistry = loadDefaultAgents(registry, {
    chatModel,
    tools,
    workflowEngine,
    qaChain: { invoke: jest.fn(async () => ({ answer: "réponse RAG", citations: [] })) },
    summarizationChain: { invoke: jest.fn(async () => ({ summary: "synthèse" })) },
    planner: { plan: jest.fn(async () => []) },
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: jest.fn(),
    memory,
    maxToolCalls: 5,
    maxHistoryMessages,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: {},
  });

  const manager = new AIManager({
    conversationManager,
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry }),
    toolRouter: new ToolRouter({ tools, toolModuleIndex: new Map(), maxTools: 10 }),
    workflowManager: new WorkflowManager({ chatModel, qaChain: { invoke: jest.fn() }, workflowEngine }),
    responseBuilder: new ResponseBuilder(),
    contextResolver: new ConversationContextResolver({ catalog: DEFAULT_INTENT_CATALOG }),
  });

  return { manager, conversationManager };
}

describe("Natural Conversation Engine — l'exemple canonique demandé, avec le VRAI IntentDetector/ProjectAgent", () => {
  test('« Montre-moi les projets. » puis « Et lesquels sont en retard ? » : le tour 2 produit le VRAI classement par attention, pas une réponse générique', async () => {
    const tool = listProjectsTool([project()]);
    const { manager } = buildManager({ tools: [tool] });

    const first = await manager.handleMessage({ message: "Montre-moi les projets.", user: USER, conversationId: "conv-1" });
    expect(first.intent).toBe("projects");

    const second = await manager.handleMessage({ message: "Et lesquels sont en retard ?", user: USER, conversationId: "conv-1" });

    expect(second.mode).not.toBe("clarification");
    expect(second.intent).toBe("projects");
    expect(second.agent).toBe("project_agent");
    // La preuve que ce n'est pas juste "le bon Agent a été choisi" mais que
    // le VRAI raisonnement métier (ProjectAttentionAnalyzer) a tourné :
    expect(second.toolCalls.some((c) => c.tool === "analyze_project_attention")).toBe(true);
    expect(second.answer).toMatch(/retard/i);
  });

  test("sans le mot 'projet' ni 'retard' au tour 2 — seule la résolution de contexte permet au VRAI catalogue de router correctement", async () => {
    const tool = listProjectsTool([project()]);
    const { manager } = buildManager({ tools: [tool] });

    await manager.handleMessage({ message: "Montre-moi les projets.", user: USER, conversationId: "conv-2" });
    // "attention" n'est un mot-clé d'AUCUNE intention du catalogue global
    // (seulement un marqueur LOCAL à ProjectAgent) — sans résolution de
    // contexte, ce message seul ne routerait pas vers "projects".
    const second = await manager.handleMessage({ message: "Et lesquels nécessitent une attention ?", user: USER, conversationId: "conv-2" });

    expect(second.intent).toBe("projects");
    expect(second.toolCalls.some((c) => c.tool === "analyze_project_attention")).toBe(true);
  });
});

describe("Natural Conversation Engine — reformulations/corrections, avec un vrai résultat métier", () => {
  test('« Montre-moi les projets. » puis « Finalement, seulement les urgentes. » : corrigé vers le même sujet, VRAIE analyse d\'attention', async () => {
    const tool = listProjectsTool([project()]);
    const { manager } = buildManager({ tools: [tool] });

    await manager.handleMessage({ message: "Montre-moi les projets.", user: USER, conversationId: "conv-3" });
    const second = await manager.handleMessage({ message: "Finalement, seulement les urgentes.", user: USER, conversationId: "conv-3" });

    expect(second.mode).not.toBe("clarification");
    expect(second.intent).toBe("projects");
    expect(second.toolCalls.some((c) => c.tool === "analyze_project_attention")).toBe(true);
  });

  test("une correction en tout DÉBUT de conversation (rien à corriger) déclenche une clarification, jamais une réponse devinée", async () => {
    const { manager } = buildManager({ tools: [] });
    const response = await manager.handleMessage({ message: "Non, plutôt autre chose.", user: USER, conversationId: "conv-4" });
    expect(response.mode).toBe("clarification");
  });
});

describe("Natural Conversation Engine — conversations longues (le sujet survit à la fenêtre d'historique)", () => {
  test("après 30 tours de bavardage générique (fenêtre d'historique réglée à 4), une question sans AUCUN mot-clé propre résout toujours vers 'projects'", async () => {
    const tool = listProjectsTool([project()]);
    const { manager, conversationManager } = buildManager({ tools: [tool], maxHistoryMessages: 4 });

    await manager.handleMessage({ message: "Montre-moi les projets.", user: USER, conversationId: "conv-5" });
    expect(conversationManager.getCurrentTopic("conv-5")).toBe("projects");

    // 30 tours de bavardage générique (aucun mot-clé, longs pour ne PAS
    // déclencher le signal faible "reformulation elliptique" — chacun
    // routé vers "general_chat", délibérément EXCLU du suivi de sujet
    // (voir conversationManager.js) : le sujet "projects" n'est donc
    // JAMAIS rafraîchi par ces tours, seulement conservé tel quel.
    for (let i = 0; i < 30; i++) {
      await manager.handleMessage({ message: `Merci beaucoup pour cette information tout à fait généraliste numéro ${i}.`, user: USER, conversationId: "conv-5" });
    }

    // Avec une fenêtre de 4 messages, le tour fondateur ("Montre-moi les
    // projets." + sa réponse) est très largement hors de l'historique
    // rechargé par AIManager à ce stade — SEUL currentTopic peut encore
    // répondre correctement.
    expect(conversationManager.getCurrentTopic("conv-5")).toBe("projects");
    const historyWindow = await conversationManager.getHistory("conv-5");
    expect(historyWindow.some((h) => h.intent === "projects")).toBe(false);

    // "nécessitent une attention" ne contient AUCUN mot-clé du catalogue
    // global (seulement un marqueur LOCAL à ProjectAgent) — sans le sujet
    // conservé, ce message ne routerait pas vers "projects".
    const late = await manager.handleMessage({ message: "Et lesquels nécessitent une attention ?", user: USER, conversationId: "conv-5" });

    expect(late.mode).not.toBe("clarification");
    expect(late.intent).toBe("projects");
    expect(late.toolCalls.some((c) => c.tool === "analyze_project_attention")).toBe(true);
  });
});
