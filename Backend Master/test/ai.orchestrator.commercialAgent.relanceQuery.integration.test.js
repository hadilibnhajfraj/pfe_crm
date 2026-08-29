"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "EXPOSER LA
// LISTE DES CONTACTS À RELANCER AU COPILOT". VRAIE base, VRAI compte
// info@probardistribution.com. Aucune écriture DB.
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
const { PermissionManager } = require("../src/ai/mcp/permissionManager");

const REAL_COMMERCIAL = { id: "b7c50110-31de-4d2c-96b4-5a117c9e262a", role: "commercial", email: "info@probardistribution.com" };

afterAll(async () => {
  await sequelize.close();
});

function buildManagerFor(actingUser) {
  const server = createServer({ rateLimiter: null, auditLog: null });
  // Non filtré aux seuls Tools commerciaux : les tests de non-régression
  // (projects/capability_audit/meetings) ont besoin de list_projects et des
  // Tools googleCalendar — chaque Agent reste de toute façon limité à SA
  // PROPRE liste blanche (allowedToolNames), donc rien n'est élargi ici.
  const langchainTools = createMcpToolAdapters({ mcpServer: server, actingUser });

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

describe("PHASE 2 — trace pipeline réel : « Quels clients dois-je relancer cette semaine ? » avec le VRAI compte info@probardistribution.com", () => {
  test("intent=commercial_contacts, agent=commercial_agent, VRAIES données (73 contacts « à rappeler plus tard » sur 485, listés nommément)", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({
      message: "Quels clients dois-je relancer cette semaine ?",
      user: REAL_COMMERCIAL,
      conversationId: "live-relance-q1",
    });

    expect(response.intent).toBe("commercial_contacts");
    expect(response.agent).toBe("commercial_agent");
    expect(response.mode).not.toBe("error");
    expect(response.answer).not.toMatch(/documentation/i);
    expect(response.answer).toContain("73");

    const toolStep = response.toolCalls.find((c) => c.tool === "get_my_commercial_contacts");
    expect(toolStep).toBeDefined();
    expect(toolStep.input).toEqual({ status: "rappeler_plus_tard", limit: 20 }); // jamais de commercialName/ownerId/userId
  }, 30000);

  test("les 4 questions mandatées de la mission P1.3 obtiennent toutes une VRAIE liste de contacts", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const messages = [
      "Montre-moi les contacts rappeler_plus_tard",
      "Donne-moi les 10 premiers contacts à rappeler",
      "Quels clients dois-je relancer ?",
      "Quels contacts dois-je rappeler ?",
    ];
    for (const message of messages) {
      const response = await manager.handleMessage({ message, user: REAL_COMMERCIAL, conversationId: `live-p13-${message.length}-${Math.random()}` });
      expect(response.intent).toBe("commercial_contacts");
      expect(response.agent).toBe("commercial_agent");
      expect(response.answer).toContain("73");
      const toolStep = response.toolCalls.find((c) => c.tool === "get_my_commercial_contacts");
      expect(toolStep).toBeDefined();
      expect(toolStep.input).toEqual({ status: "rappeler_plus_tard", limit: 20 });
    }
  }, 30000);

  test("les 8 formulations du Phase 10 (P1.2) obtiennent toutes la même liste réelle", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const messages = [
      "Quels clients dois-je relancer cette semaine ?",
      "Quels clients dois-je relancer ?",
      "Qui dois-je relancer ?",
      "Quels sont mes clients en retard de relance ?",
      "Quels contacts nécessitent une relance ?",
      "Montre-moi mes relances prioritaires",
      "Quels prospects dois-je relancer ?",
      "Quels clients sont à rappeler ?",
    ];
    for (const message of messages) {
      const response = await manager.handleMessage({ message, user: REAL_COMMERCIAL, conversationId: `live-relance-${message.length}` });
      expect(response.intent).toBe("commercial_contacts");
      expect(response.agent).toBe("commercial_agent");
      expect(response.answer).toContain("73");
    }
  }, 30000);
});

describe("PHASE 9 — RBAC/anti-fuite réel : status/ownerId/userId/commercialName='najeh' injectés n'ont AUCUN effet", () => {
  test("le VRAI Tool ignore toute tentative d'élargissement — reste scopé aux 485/73 réels du compte", async () => {
    const server = createServer({ rateLimiter: null, auditLog: null });
    const permissionManager = new PermissionManager();
    const tool = server.toolRegistry.get("get_my_commercial_contacts");
    permissionManager.assertCanCall(tool, REAL_COMMERCIAL);

    for (const maliciousInput of [
      { status: "rappeler_plus_tard" },
      { status: "rappeler_plus_tard", ownerId: "00000000-0000-4000-8000-000000000099" },
      { status: "rappeler_plus_tard", userId: "00000000-0000-4000-8000-000000000099" },
      { status: "rappeler_plus_tard", commercialName: "najeh" },
      { status: "rappeler_plus_tard", createdBy: "00000000-0000-4000-8000-000000000099" },
    ]) {
      const result = await tool.execute(maliciousInput, { actingUser: REAL_COMMERCIAL });
      expect(result.total).toBe(73); // jamais un scope "najeh" ou un autre utilisateur
      expect(Array.isArray(result.contacts)).toBe(true);
    }
  }, 30000);

  test("le total sans filtre de statut reste 485 (jamais élargi par ownerId/userId/commercialName)", async () => {
    const server = createServer({ rateLimiter: null, auditLog: null });
    const permissionManager = new PermissionManager();
    const tool = server.toolRegistry.get("get_my_commercial_contacts");
    permissionManager.assertCanCall(tool, REAL_COMMERCIAL);

    const result = await tool.execute({ ownerId: "00000000-0000-4000-8000-000000000099", commercialName: "najeh" }, { actingUser: REAL_COMMERCIAL });
    expect(result.total).toBe(485);
  }, 30000);
});

describe("Non-régression P0/P1 — les correctifs précédents restent intacts", () => {
  test("« Quels sont mes projets critiques ? » -> toujours projects/project_agent (P0 inchangé)", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({ message: "Quels sont mes projets critiques ?", user: REAL_COMMERCIAL, conversationId: "live-regr-1" });
    expect(response.intent).toBe("projects");
    expect(response.agent).toBe("project_agent");
  }, 30000);

  test("« Qu'est-ce que je peux faire ? » -> toujours capability_audit", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({ message: "Qu'est-ce que je peux faire ?", user: REAL_COMMERCIAL, conversationId: "live-regr-2" });
    expect(response.intent).toBe("capability_audit");
    expect(response.agent).toBe("role_capability_audit_agent");
  }, 30000);

  test("« Programmer une réunion » -> toujours meetings/meeting_agent", async () => {
    const manager = buildManagerFor(REAL_COMMERCIAL);
    const response = await manager.handleMessage({ message: "Programmer une réunion", user: REAL_COMMERCIAL, conversationId: "live-regr-3" });
    expect(response.intent).toBe("meetings");
    expect(response.agent).toBe("meeting_agent");
  }, 30000);
});

describe("Non-régression — get_commercial_personal_kpi_summary (P0) toujours intact et distinct du nouveau Tool", () => {
  test("appelé directement, {} reste le scope P0 : jamais impacté par get_my_commercial_contacts", async () => {
    const server = createServer({ rateLimiter: null, auditLog: null });
    const permissionManager = new PermissionManager();
    const tool = server.toolRegistry.get("get_commercial_personal_kpi_summary");
    permissionManager.assertCanCall(tool, REAL_COMMERCIAL);
    const result = await tool.execute({}, { actingUser: REAL_COMMERCIAL });
    expect(result.totalContacts).toBe(485);
    const rappelerRow = (result.contactsByStatus || []).find((r) => r.status === "rappeler_plus_tard");
    expect(Number(rappelerRow.count)).toBe(73);
  }, 30000);
});
