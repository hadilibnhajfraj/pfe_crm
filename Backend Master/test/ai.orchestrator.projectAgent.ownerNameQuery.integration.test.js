"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "IMPLÉMENTER PROJETS D'UN UTILISATEUR NOMMÉ" — Phase 8 (test live
// read-only obligatoire), rendu permanent. VRAIE base, VRAIS comptes
// (superadmin réel, Hadil réelle, un autre utilisateur réel), VRAIS Tools
// MCP branchés sur les VRAIS services. Aucune écriture DB.
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
const REAL_HADIL = { id: "516f6dca-7a6f-43cb-b527-5c5652e3e03f", role: "user", email: "hadil.ibnhajfraj@gmail.com" };
const REAL_OTHER_USER = { id: "4397d7c5-dc08-4ea0-b24c-d55c6aa0413f", role: "user", email: "wethek@gmail.com" };
const REAL_COMMERCIAL = { id: "b7c50110-31de-4d2c-96b4-5a117c9e262a", role: "commercial", email: "info@probardistribution.com" };

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

describe("PHASE 8 — test live read-only : « Quels sont les projets de Hadil ? » avec un VRAI compte admin-tier", () => {
  test("intent=projects, agent=project_agent, ownerId résolu = VRAI UUID de Hadil, 17 projets (données réelles au moment de l'audit)", async () => {
    const manager = buildManagerFor(REAL_SUPERADMIN);
    const response = await manager.handleMessage({
      message: "Quels sont les projets de Hadil ?",
      user: REAL_SUPERADMIN,
      conversationId: "live-owner-name-admin",
    });

    expect(response.intent).toBe("projects");
    expect(response.agent).toBe("project_agent");
    expect(response.mode).not.toBe("error");

    const listStep = response.toolCalls.find((c) => c.tool === "list_projects");
    expect(listStep).toBeDefined();
    expect(listStep.input.ownerId).toBe(REAL_HADIL.id); // résolu côté serveur, jamais un UUID du message
    expect(response.answer).toContain("Hadil");
    expect(response.answer).not.toMatch(/aucun utilisateur correspondant/);
  }, 30000);
});

describe("PHASE 8 — même question avec un VRAI utilisateur non-admin : aucune fuite", () => {
  test("un autre utilisateur réel (≠Hadil, non admin-tier) est refusé, jamais aucune donnée de Hadil", async () => {
    const manager = buildManagerFor(REAL_OTHER_USER);
    const response = await manager.handleMessage({
      message: "Quels sont les projets de Hadil ?",
      user: REAL_OTHER_USER,
      conversationId: "live-owner-name-other-user",
    });

    expect(response.intent).toBe("projects");
    expect(response.agent).toBe("project_agent");
    expect(response.toolCalls).toEqual([]); // aucun Tool appelé, ni candidates ni list_projects
    expect(response.answer).toMatch(/pas autorisée pour votre rôle/);
    expect(response.answer).not.toMatch(/hadil/i);
  }, 30000);

  test("un commercial réel obtient le même refus déterministe", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({
      message: "Quels sont les projets de Hadil ?",
      user: REAL_COMMERCIAL,
      conversationId: "live-owner-name-commercial",
    });

    expect(response.toolCalls).toEqual([]);
    expect(response.answer).toMatch(/pas autorisée pour votre rôle/);
  }, 30000);
});

describe("Non-régression P0 — projets critiques admin-tier (mission précédente), inchangé", () => {
  test("un VRAI superadmin demandant les projets critiques obtient toujours la vue transverse (pas mine:true)", async () => {
    const manager = buildManagerFor(REAL_SUPERADMIN);
    const response = await manager.handleMessage({
      message: "Quels sont les projets critiques ?",
      user: REAL_SUPERADMIN,
      conversationId: "live-critiques-regression",
    });

    const listStep = response.toolCalls.find((c) => c.tool === "list_projects");
    expect(listStep.input).toEqual({ limit: 100, isArchived: false });
    expect(listStep.input).not.toHaveProperty("mine");
    expect(response.answer).not.toMatch(/Aucun projet ne nécessite d'attention/);
  }, 30000);
});
