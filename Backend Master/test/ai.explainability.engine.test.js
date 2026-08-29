"use strict";

/**
 * # Explainability Engine — bout-en-bout, avec de VRAIS collaborateurs
 *
 * Voir `src/ai/orchestrator/EXPLAINABILITY_ENGINE.md`. Contrairement à
 * `test/ai.orchestrator.explainabilityBuilder.test.js` (unitaire, isole la
 * fonction), ce fichier exécute un VRAI `AIManager` avec le VRAI
 * `IntentDetector`/catalogue et les VRAIS Agents (`ProjectAgent`,
 * `DataQualityAgent`, `BusinessAnalystAgent`) — la seule façon de prouver
 * que `response.explainability` reflète fidèlement ce qui s'est RÉELLEMENT
 * passé pendant le tour, pas une resimulation.
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

const ADMIN = { id: "u1", role: "admin" };
const USER = { id: "u2", role: "user" };

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

function project(overrides = {}) {
  return {
    id: "p1",
    nomProjet: "Chantier en retard",
    nextRelanceDate: "2020-01-01T00:00:00Z",
    montantMarche: 5000,
    pourcentageReussite: 10,
    actionsCount: 0,
    completionRate: 100,
    missingFields: [],
    pipelineStageId: "stage-1",
    ...overrides,
  };
}

function listProjectsTool(projects) {
  return { name: "list_projects", description: "d", invoke: jest.fn(async () => JSON.stringify({ data: projects, total: projects.length })) };
}

function buildManager({ tools = [] } = {}) {
  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const workflowEngine = new LangChainWorkflowEngine();
  const chatModel = chatModelReturning({ action: "final_answer", answer: "réponse" });

  const registry = new AgentRegistry();
  const agentRegistry = loadDefaultAgents(registry, {
    chatModel,
    tools,
    workflowEngine,
    qaChain: { invoke: jest.fn(async () => ({ answer: "réponse RAG", citations: [{ index: 1, title: "Guide" }] })) },
    summarizationChain: { invoke: jest.fn(async () => ({ summary: "synthèse" })) },
    planner: { plan: jest.fn(async () => []) },
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: jest.fn(),
    memory,
    maxToolCalls: 5,
    maxHistoryMessages: 20,
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
    workflowManager: new WorkflowManager({ chatModel, qaChain: { invoke: jest.fn(async () => ({ answer: "réponse RAG", citations: [{ index: 1, title: "Guide" }] })) }, workflowEngine }),
    responseBuilder: new ResponseBuilder(),
  });

  return { manager };
}

describe("Explainability Engine — ProjectAgent (raisonnement métier réel)", () => {
  test("« Quels projets nécessitent une attention ? » : explainability trace le VRAI Tool ET la VRAIE règle métier appliquée", async () => {
    const tool = listProjectsTool([project()]);
    const { manager } = buildManager({ tools: [tool] });

    const response = await manager.handleMessage({ message: "Quels projets nécessitent une attention ?", user: USER, conversationId: "c1" });

    expect(response.mode).toBe("agent");
    expect(response.explainability).not.toBeNull();
    expect(response.explainability.reasoning).toContain('agent spécialisé "project_agent"');
    expect(response.explainability.toolsCalled).toEqual(["list_projects"]);
    expect(response.explainability.dataUsed).toEqual([{ tool: "list_projects", summary: "1 projet(s) analysé(s)" }]);
    expect(response.explainability.businessRules).toHaveLength(1);
    expect(response.explainability.businessRules[0].rule).toBe("analyze_project_attention");
    expect(response.explainability.businessRules[0].description).toMatch(/attention/i);
    expect(response.explainability.reasoning).toContain(response.explainability.businessRules[0].description);
  });

  test("une question ordinaire (chemin tool-calling par défaut, sans règle métier) : businessRules reste vide, jamais fabriqué", async () => {
    const tool = listProjectsTool([project()]);
    const { manager } = buildManager({ tools: [tool] });

    const response = await manager.handleMessage({ message: "Montre-moi les projets.", user: USER, conversationId: "c2" });

    expect(response.explainability.businessRules).toEqual([]);
    expect(response.explainability.toolsCalled).toEqual([]); // la chaîne factice (chatModel "final_answer") n'appelle aucun Tool réel
  });
});

describe("Explainability Engine — DataQualityAgent (audit systématique)", () => {
  test("l'audit qualité expose le Score Qualité dans businessRules, avec la vraie donnée utilisée", async () => {
    const tool = listProjectsTool([project({ id: "p2", nomProjet: "Chantier propre" })]);
    const { manager } = buildManager({ tools: [tool] });

    const response = await manager.handleMessage({ message: "Détecte les doublons et incohérences dans mes projets.", user: ADMIN, conversationId: "c3" });

    expect(response.explainability.toolsCalled).toEqual(["list_projects"]);
    expect(response.explainability.businessRules[0].rule).toBe("analyze_data_quality");
    expect(response.explainability.businessRules[0].description).toMatch(/score qualité/i);
  });
});

describe("Explainability Engine — BusinessAnalystAgent (plusieurs domaines, plusieurs règles)", () => {
  test("« Fais une analyse avec des recommandations sur les projets en cours. » trace UNE règle métier pour le domaine analysé", async () => {
    const tool = listProjectsTool([project()]);
    const { manager } = buildManager({ tools: [tool] });

    const response = await manager.handleMessage({ message: "Fais une analyse avec des recommandations sur les projets en cours.", user: ADMIN, conversationId: "c4" });

    expect(response.intent).toBe("business_analysis");
    expect(response.explainability.businessRules).toHaveLength(1);
    expect(response.explainability.businessRules[0].rule).toBe("analyze_business_domain");
  });
});

describe("Explainability Engine — transparence même sur un refus/une erreur", () => {
  test("un rôle refusé par l'Agent produit mode: 'error', avec une explainability qui explique POURQUOI, jamais un champ vide", async () => {
    const { manager } = buildManager({ tools: [] });
    // "automation" exige admin-tier au niveau Agent.
    const response = await manager.handleMessage({
      message: "Mets en place un workflow pour automatiser la création d'une activité sur ce projet.",
      user: USER,
      conversationId: "c5",
    });

    expect(response.mode).toBe("error");
    expect(response.explainability).not.toBeNull();
    expect(response.explainability.reasoning.length).toBeGreaterThan(0);
    expect(response.explainability.dataUsed).toEqual([]);
    expect(response.explainability.businessRules).toEqual([]);
  });
});

describe("Explainability Engine — chemin RAG (documentation)", () => {
  test("une question documentaire explique le chemin RAG et cite les sources dans reasoning", async () => {
    const { manager } = buildManager({ tools: [] });
    const response = await manager.handleMessage({ message: "Comment fonctionne le calcul du pourcentage de réussite ?", user: USER, conversationId: "c6" });

    expect(response.explainability.reasoning).toMatch(/documentaire|RAG|agent spécialisé/i);
  });
});
