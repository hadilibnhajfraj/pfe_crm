"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "CORRIGER LA RECHERCHE/DESCRIPTION D'UN PROJET PAR SON NOM" — Phase 8
// (test live obligatoire), rendu permanent. VRAIE base, VRAI projet
// "Résidence HOLYA", VRAIS comptes. Aucune écriture DB.
require("dotenv").config();
const { sequelize } = require("../src/db");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { loadDefaultAgents } = require("../src/ai/agents/manifest");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { createServer } = require("../src/ai/mcp/server/start");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools/mcpToolAdapter");

const REAL_SUPERADMIN = { id: "6242fb88-a0bc-4535-bddd-5285b91ca0ed", role: "superadmin", email: "cbitunisia@cbi-tunisia.com" };
const REAL_OTHER_NON_ADMIN = { id: "b7c50110-31de-4d2c-96b4-5a117c9e262a", role: "commercial", email: "info@probardistribution.com" };
const REAL_PROJECT_ID = "111d9f7b-fd06-4716-b07a-5361feba97d9"; // "Résidence HOLYA"
const REAL_PROJECT_OWNER_ID = "a43225c5-4e01-411d-aa9b-afe2c25f38a6"; // Mohamed Wethak Khochtali

afterAll(async () => {
  await sequelize.close();
});

function buildManagerFor(actingUser) {
  const server = createServer({ rateLimiter: null, auditLog: null });
  const allTools = createMcpToolAdapters({ mcpServer: server, actingUser });
  const langchainTools = allTools.filter((t) => ["list_projects", "move_project_stage", "assign_project_owner", "list_commercial_candidates"].includes(t.name));

  const memory = new InMemoryConversationMemory();
  const conversationManager = new ConversationManager({ memory });
  const registry = new AgentRegistry();
  loadDefaultAgents(registry, {
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: async () => { throw new Error("LLM non sollicité — chemin déterministe"); } } }),
    tools: langchainTools,
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { invoke: async () => ({ answer: "x", citations: [] }) },
    summarizationChain: { invoke: async () => ({ summary: "x" }) },
    planner: { plan: async () => [] },
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: async () => {},
    memory,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: {},
  });

  return new AIManager({
    conversationManager,
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry: registry }),
    toolRouter: { select: () => [] },
    workflowManager: { run: async () => ({ mode: "qa", answer: "", citations: [], toolSteps: [] }) },
    responseBuilder: new ResponseBuilder(),
  });
}

describe("PHASE 8 — test live : « voir les projets de Mohamed Wethak Khochtali » puis « décrire projet Résidence HOLYA »", () => {
  test("question 1 : 67 projets réels (régression de la mission précédente)", async () => {
    const manager = buildManagerFor(REAL_SUPERADMIN);
    const response = await manager.handleMessage({
      message: "voir les projets de Mohamed Wethak Khochtali",
      user: REAL_SUPERADMIN,
      conversationId: "live-describe-q1",
    });

    expect(response.intent).toBe("projects");
    expect(response.agent).toBe("project_agent");
    expect(response.answer).toContain("67 projet(s)");
  }, 30000);

  test("question 2 : « décrire projet Résidence HOLYA » -> VRAI projet trouvé, VRAIS détails, jamais 'aucun projet'", async () => {
    const manager = buildManagerFor(REAL_SUPERADMIN);
    const response = await manager.handleMessage({
      message: "décrire projet Résidence HOLYA",
      user: REAL_SUPERADMIN,
      conversationId: "live-describe-q2",
    });

    expect(response.intent).toBe("projects");
    expect(response.agent).toBe("project_agent");
    expect(response.answer).not.toMatch(/aucun projet/i);
    expect(response.answer).toContain("Résidence HOLYA");

    const listStep = response.toolCalls.find((c) => c.tool === "list_projects");
    expect(listStep).toBeDefined();
    expect(listStep.input).not.toHaveProperty("mine"); // admin-tier : transverse
  }, 30000);

  test("les 3 autres formulations mission résolvent le MÊME projet réel", async () => {
    const manager = buildManagerFor(REAL_SUPERADMIN);
    for (const message of [
      "donne-moi les détails de Résidence HOLYA",
      "parle-moi du projet Résidence HOLYA",
      "quelles sont les informations du projet Résidence HOLYA ?",
      "montre-moi les détails de Résidence HOLYA",
    ]) {
      const response = await manager.handleMessage({ message, user: REAL_SUPERADMIN, conversationId: `live-describe-${message.length}` });
      expect(response.intent).toBe("projects");
      expect(response.agent).toBe("project_agent");
      expect(response.answer).toContain("Résidence HOLYA");
      expect(response.answer).not.toMatch(/aucun projet/i);
    }
  }, 30000);
});

describe("PHASE 8 — RBAC réel : un utilisateur non-admin-tier ne peut pas décrire le projet réel d'un autre utilisateur", () => {
  test("un VRAI commercial (≠ propriétaire) décrivant « Résidence HOLYA » -> introuvable, aucune fuite", async () => {
    const manager = buildManagerFor(REAL_OTHER_NON_ADMIN);
    const response = await manager.handleMessage({
      message: "décrire projet Résidence HOLYA",
      user: REAL_OTHER_NON_ADMIN,
      conversationId: "live-describe-rbac",
    });

    expect(response.answer).toBe("Je n'ai trouvé aucun projet correspondant à « Résidence HOLYA ».");
    expect(response.answer).not.toContain(REAL_PROJECT_OWNER_ID);
    expect(response.answer).not.toContain("Mohamed Wethak Khochtali");

    const listStep = response.toolCalls.find((c) => c.tool === "list_projects");
    expect(listStep.input.mine).toBe(true); // jamais contourné
  }, 30000);
});

describe("Non-régression P0 — projets critiques admin-tier, inchangé", () => {
  test("un VRAI superadmin obtient toujours la vue transverse pour les projets critiques", async () => {
    const manager = buildManagerFor(REAL_SUPERADMIN);
    const response = await manager.handleMessage({
      message: "Quels sont les projets critiques ?",
      user: REAL_SUPERADMIN,
      conversationId: "live-describe-p0-regression",
    });

    const listStep = response.toolCalls.find((c) => c.tool === "list_projects");
    expect(listStep.input).toEqual({ limit: 100, isArchived: false });
    expect(response.answer).not.toMatch(/Aucun projet ne nécessite d'attention/);
  }, 30000);
});
