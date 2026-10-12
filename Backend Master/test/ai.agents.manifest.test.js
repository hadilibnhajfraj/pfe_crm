"use strict";

const { defaultAgentFactories, loadDefaultAgents } = require("../src/ai/agents/manifest");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");

// `agentRegistry` DOIT être la MÊME instance que celle passée à
// loadDefaultAgents() ci-dessous — RoleCapabilityAuditAgent (17e Agent) la
// consomme pour interroger les 16 AUTRES agents déjà enregistrés (jamais
// une seconde liste) ; auto-référence sans risque, jamais lue avant la fin
// de l'enregistrement (voir capabilityMatrixService.js).
function buildDeps(agentRegistry) {
  return {
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => "unused") } }),
    tools: [],
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { name: "qa_chain", invoke: jest.fn(async () => ({ answer: "x", citations: [] })) },
    summarizationChain: { name: "summarization_chain", invoke: jest.fn(async () => ({ summary: "x" })) },
    planner: { plan: jest.fn(async () => []) },
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: jest.fn(),
    memory: null,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: {},
  };
}

describe("agents/manifest", () => {
  test("declares exactly the 23 specialized Agents (11 d'origine + BusinessAnalystAgent + RecommendationAgent + DataQualityAgent + AdvancedSearchAgent + MeetingAgent + RoleCapabilityAuditAgent + HRAgent + PorPromeshAgent + DocumentAgent + TaskPlannerAgent + AnalyticsAgent + EntityLookupAgent)", () => {
    expect(defaultAgentFactories).toHaveLength(23);
  });

  test("loadDefaultAgents registers all 23 into the given AgentRegistry", () => {
    const registry = new AgentRegistry();
    loadDefaultAgents(registry, buildDeps(registry));
    expect(registry.list()).toHaveLength(23);
    expect(registry.list().map((a) => a.name).sort()).toEqual(
      [
        "advanced_search_agent",
        "analytics_agent",
        "assistant_agent",
        "automation_agent",
        "business_analyst_agent",
        "commercial_agent",
        "crm_assistant_agent",
        "data_quality_agent",
        "document_agent",
        "entity_lookup_agent",
        "hr_agent",
        "industrial_agent",
        "kpi_agent",
        "maintenance_agent",
        "meeting_agent",
        "notification_agent",
        "pipeline_agent",
        "por_promesh_agent",
        "project_agent",
        "recommendation_agent",
        "reporting_agent",
        "role_capability_audit_agent",
        "task_planner_agent",
      ].sort()
    );
  });

  test("every registered agent claims at least one intent, and no two agents claim the same intent", () => {
    const registry = new AgentRegistry();
    loadDefaultAgents(registry, buildDeps(registry));

    const allIntentNames = [
      "documentation_question",
      "users",
      "projects",
      "pipeline",
      "commercial_contacts",
      "maintenance",
      "notifications",
      "industrial",
      "por_promesh",
      "dashboard",
      "reporting",
      "hr",
      "meetings",
      "reminders",
      "automation",
      "business_analysis",
      "recommendation",
      "data_quality",
      "advanced_search",
      "capability_audit",
      "general_chat",
    ];

    const claimedBy = new Map();
    for (const intentName of allIntentNames) {
      const matches = registry.list().filter((agent) => agent.canHandle({ name: intentName }));
      expect(matches.length).toBeLessThanOrEqual(1);
      if (matches.length === 1) claimedBy.set(intentName, matches[0].name);
    }

    // users a toujours aucun Agent dédié (P2, hors scope de cette mission) —
    // AgentRouter.select() retourne null, AIManager retombe sur
    // WorkflowManager/ToolRouter exactement comme avant (voir
    // orchestrator/aiManager.js). hr/por_promesh, eux, ont désormais un
    // Agent dédié (mission "IMPLÉMENTER HRAgent ET PorPromeshAgent", P1 du
    // rapport d'audit précédent).
    expect(claimedBy.has("users")).toBe(false);
    expect(claimedBy.get("por_promesh")).toBe("por_promesh_agent");
    expect(claimedBy.get("hr")).toBe("hr_agent");

    expect(claimedBy.get("dashboard")).toBe("kpi_agent");
    expect(claimedBy.get("reporting")).toBe("reporting_agent");
    expect(claimedBy.get("automation")).toBe("automation_agent");
    expect(claimedBy.get("general_chat")).toBe("assistant_agent");
    expect(claimedBy.get("documentation_question")).toBe("crm_assistant_agent");
    expect(claimedBy.get("business_analysis")).toBe("business_analyst_agent");
    expect(claimedBy.get("recommendation")).toBe("recommendation_agent");
    expect(claimedBy.get("data_quality")).toBe("data_quality_agent");
    expect(claimedBy.get("advanced_search")).toBe("advanced_search_agent");
    expect(claimedBy.get("meetings")).toBe("meeting_agent");
    expect(claimedBy.get("reminders")).toBe("meeting_agent");
    expect(claimedBy.get("capability_audit")).toBe("role_capability_audit_agent");
  });
});
