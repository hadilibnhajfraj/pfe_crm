"use strict";

// Real src/ai/mcp/tools/index.js requires all 69 real ServiceBackedTool
// factories, which require the real business services, which require
// Sequelize models (DB config required — see mcp/server/start.js). None of
// that is needed to unit-test how createAiOrchestrator *wires* its
// collaborators together, so it's replaced with a tiny two-module fake —
// same technique already used by test/ai.mcp.tools.*.test.js to mock a
// single business service.
jest.mock("../src/ai/mcp/tools", () => ({
  byModule: {
    maintenance: {
      toolFactories: [() => ({ name: "list_maintenance_requests", description: "Liste les demandes de maintenance", inputSchema: null, requiredRoles: [], execute: jest.fn() })],
    },
    hr: {
      toolFactories: [() => ({ name: "list_hr_requests", description: "Liste les demandes RH", inputSchema: null, requiredRoles: [], execute: jest.fn() })],
    },
    notifications: {
      toolFactories: [
        () => ({ name: "send_notification_email", description: "Envoie un email", inputSchema: null, requiredRoles: ["admin", "superadmin", "superadmin2"], execute: jest.fn() }),
      ],
    },
  },
}));

const { createAiOrchestrator, buildToolModuleIndex, buildToolPermissionIndex } = require("../src/ai/orchestrator/pipeline");
const { SuggestionEngine } = require("../src/ai/orchestrator/suggestionEngine");
const { NotConfiguredError } = require("../src/ai/orchestrator/errors");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { ShortTermMemory } = require("../src/ai/memory/shortTermMemory");
const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");

function fakeLlmProvider(reply = "Réponse générée.") {
  return { complete: jest.fn(async () => reply) };
}

function fakeRetriever() {
  return { retrieve: jest.fn(async () => ({ results: [], citations: [] })) };
}

function fakeMcpServer(toolNames) {
  return {
    toolRegistry: { list: () => toolNames.map((name) => ({ name, description: `${name} desc`, inputSchema: null })) },
    handleMessage: jest.fn(async () => ({ result: { content: [{ type: "text", text: "{}" }] } })),
  };
}

const ACTING_USER = { id: "u1", role: "user" };

describe("buildToolModuleIndex", () => {
  test("maps every tool name from the (mocked) byModule manifest to its module key", () => {
    const index = buildToolModuleIndex();
    expect(index.get("list_maintenance_requests")).toBe("maintenance");
    expect(index.get("list_hr_requests")).toBe("hr");
  });
});

describe("buildToolPermissionIndex", () => {
  test("maps every tool name from the (mocked) byModule manifest to its real requiredRoles/allowedEmails — never a duplicated/invented value", () => {
    const index = buildToolPermissionIndex();
    expect(index.get("list_maintenance_requests")).toEqual({ requiredRoles: [], allowedEmails: [] });
    expect(index.get("send_notification_email")).toEqual({ requiredRoles: ["admin", "superadmin", "superadmin2"], allowedEmails: [] });
  });
});

describe("createAiOrchestrator — required collaborators", () => {
  test("throws NotConfiguredError without an llmProvider", () => {
    expect(() => createAiOrchestrator({ retriever: fakeRetriever(), mcpServer: fakeMcpServer([]), actingUser: ACTING_USER })).toThrow(NotConfiguredError);
  });

  test("throws NotConfiguredError without a retriever", () => {
    expect(() => createAiOrchestrator({ llmProvider: fakeLlmProvider(), mcpServer: fakeMcpServer([]), actingUser: ACTING_USER })).toThrow(NotConfiguredError);
  });

  test("throws NotConfiguredError without a mcpServer", () => {
    expect(() => createAiOrchestrator({ llmProvider: fakeLlmProvider(), retriever: fakeRetriever(), actingUser: ACTING_USER })).toThrow(NotConfiguredError);
  });

  test("throws NotConfiguredError without an actingUser", () => {
    expect(() => createAiOrchestrator({ llmProvider: fakeLlmProvider(), retriever: fakeRetriever(), mcpServer: fakeMcpServer([]) })).toThrow(NotConfiguredError);
  });
});

describe("createAiOrchestrator — wiring", () => {
  function build(overrides = {}) {
    return createAiOrchestrator({
      llmProvider: fakeLlmProvider(),
      retriever: fakeRetriever(),
      mcpServer: fakeMcpServer(["list_maintenance_requests", "list_hr_requests"]),
      actingUser: ACTING_USER,
      createCopilotMeeting: jest.fn(),
      ...overrides,
    });
  }

  test("wires an AIManager and a ConversationManager", () => {
    const pipeline = build();
    expect(pipeline.aiManager).toBeInstanceOf(AIManager);
    expect(pipeline.conversationManager).toBeInstanceOf(ConversationManager);
  });

  test("ToolRouter sees one LangChain tool per registered MCP tool, correctly attributed to its module", () => {
    const pipeline = build();
    const maintenanceTools = pipeline.toolRouter.select({ requiresTools: true, moduleKey: "maintenance" }, "une panne");
    const hrTools = pipeline.toolRouter.select({ requiresTools: true, moduleKey: "hr" }, "un congé");
    expect(maintenanceTools.map((t) => t.name)).toEqual(["list_maintenance_requests"]);
    expect(hrTools.map((t) => t.name)).toEqual(["list_hr_requests"]);
  });

  test("shares one IConversationMemory instance between ConversationManager and the LangChain Context Builder", () => {
    const pipeline = build();
    expect(pipeline.memory).toBe(pipeline.langChainPipeline.contextBuilder.memory);
  });

  test("étape 12 du workflow : un auditLog optionnel est transmis tel quel à AIManager (journalisation des tours de conversation)", () => {
    const auditLog = { record: jest.fn() };
    const pipeline = build({ auditLog });
    expect(pipeline.aiManager.auditLog).toBe(auditLog);
  });

  test("sans auditLog fourni, AIManager reste rétrocompatible (aucune journalisation, aucune erreur)", () => {
    const pipeline = build();
    expect(pipeline.aiManager.auditLog).toBeNull();
  });

  test("génération de réponse : le ton du WorkflowManager est dérivé du rôle de actingUser", () => {
    const pipeline = build({ actingUser: { id: "u1", role: "direction" } });
    expect(pipeline.workflowManager.role).toBe("direction");
  });

  test("a supplied memory instance is reused rather than replaced", () => {
    const { InMemoryConversationMemory } = require("../src/ai/memory");
    const memory = new InMemoryConversationMemory();
    const pipeline = build({ memory });
    expect(pipeline.memory).toBe(memory);
    expect(pipeline.langChainPipeline.contextBuilder.memory).toBe(memory);
  });

  test("respects AI_ORCHESTRATOR_* env overrides via the env option", () => {
    const pipeline = build({ env: { AI_ORCHESTRATOR_MAX_CANDIDATE_TOOLS: "9", AI_ORCHESTRATOR_DEFAULT_INTENT: "hr" } });
    expect(pipeline.config.maxCandidateTools).toBe(9);
    expect(pipeline.config.defaultIntent).toBe("hr");
  });

  test("wires the 23 specialized Agents by default (agents/manifest.js::loadDefaultAgents)", () => {
    const pipeline = build();
    expect(pipeline.agentRegistry.list()).toHaveLength(23);
  });

  // Analytique CRM : un seul AnalyticsQueryParser, partagé par l'AIManager
  // (routage) et l'AnalyticsAgent (requête).
  test("wires AnalyticsAgent and the AIManager on the SAME AnalyticsQueryParser", () => {
    const pipeline = build();
    const agent = pipeline.agentRegistry.get("analytics_agent");
    expect(agent).toBeTruthy();
    expect(agent.parser).toBe(pipeline.aiManager.analyticsParser);
  });

  // Phase 3 — TaskPlannerAgent : même PendingActionStore partagé, index de
  // permissions réel (celui des Tools), et TaskPlanner transmis à l'AIManager.
  test("wires TaskPlannerAgent on the SHARED PendingActionStore and the real tool permission index", () => {
    const pipeline = build();
    const agent = pipeline.agentRegistry.get("task_planner_agent");
    expect(agent.confirmationManager.store).toBe(pipeline.pendingActionStore);
    // Même index (même instance) que celui du SuggestionEngine — construit
    // depuis les rôles déclarés par les Tools (mcp/tools est simulé ici).
    expect(agent.toolPermissionIndex).toBe(pipeline.suggestionEngine.toolPermissionIndex);
    expect(pipeline.aiManager.taskPlanner).toBeTruthy();
  });

  // AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md
  test("wires RoleCapabilityAuditAgent with a self-reference to the SAME agentRegistry it belongs to", () => {
    const pipeline = build();
    const agent = pipeline.agentRegistry.get("role_capability_audit_agent");
    expect(agent).toBeTruthy();
    expect(agent.capabilityMatrixService.agentRegistry).toBe(pipeline.agentRegistry);
  });

  test("Smart Suggestions : wires a SuggestionEngine (backed by the real tool permission index) and hands it to ProjectAgent", () => {
    const pipeline = build();
    expect(pipeline.suggestionEngine).toBeInstanceOf(SuggestionEngine);
    expect(pipeline.suggestionEngine.toolPermissionIndex.get("send_notification_email")).toEqual({
      requiredRoles: ["admin", "superadmin", "superadmin2"],
      allowedEmails: [],
    });

    const projectAgent = pipeline.agentRegistry.list().find((agent) => agent.name === "project_agent");
    expect(projectAgent.suggestionEngine).toBe(pipeline.suggestionEngine);

    const recommendationAgent = pipeline.agentRegistry.list().find((agent) => agent.name === "recommendation_agent");
    expect(recommendationAgent.suggestionEngine).toBe(pipeline.suggestionEngine);
  });

  test("Automation confirmation gate: wires ONE PendingActionStore, shared with AutomationAgent, stable across calls", () => {
    const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
    const pipeline = build();
    expect(pipeline.pendingActionStore).toBeInstanceOf(PendingActionStore);

    const automationAgent = pipeline.agentRegistry.list().find((agent) => agent.name === "automation_agent");
    expect(automationAgent.pendingActionStore).toBe(pipeline.pendingActionStore);
  });

  test("end-to-end smoke test: a general question is now handled by AssistantAgent (mode: 'agent'), which itself falls back to the RAG path internally (no allowed Tool)", async () => {
    const pipeline = build();
    const response = await pipeline.aiManager.handleMessage({ message: "bonjour, une question generale", user: ACTING_USER, conversationId: "c1" });
    expect(response.mode).toBe("agent");
    expect(response.agent).toBe("assistant_agent");
    expect(response.answer).toBe("Réponse générée.");

    const history = await pipeline.conversationManager.getHistory("c1");
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  test("includeSpecializedAgents: false restores the pre-Agents behavior (every intent falls through to WorkflowManager)", async () => {
    const pipeline = build({ includeSpecializedAgents: false });
    expect(pipeline.agentRegistry).toBeNull();

    const response = await pipeline.aiManager.handleMessage({ message: "bonjour, une question generale", user: ACTING_USER, conversationId: "c1" });
    expect(response.mode).toBe("qa");
    expect(response.answer).toBe("Réponse générée.");
  });

  test("accepts a Redis-backed ShortTermMemory as a drop-in 'memory' — it implements the same IConversationMemory port as InMemoryConversationMemory", async () => {
    const redisBackedMemory = new ShortTermMemory({ store: new InMemoryKeyValueStore() });
    const pipeline = build({ memory: redisBackedMemory });
    expect(pipeline.memory).toBe(redisBackedMemory);

    await pipeline.aiManager.handleMessage({ message: "bonjour, une question generale", user: ACTING_USER, conversationId: "c1" });
    const history = await pipeline.conversationManager.getHistory("c1");
    expect(history.map((m) => m.role)).toEqual(["user", "assistant"]);
  });
});
