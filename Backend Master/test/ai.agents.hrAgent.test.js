"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "IMPLÉMENTER HRAgent ET PorPromeshAgent" (P1). Tests structurels purs —
// aucun Tool exécuté ici, voir ai.orchestrator.hrAgent.integration.test.js
// pour l'exécution réelle contre la vraie base.

const { createHrAgent, ALLOWED_TOOL_NAMES } = require("../src/ai/agents/hrAgent");
const { BaseAgent } = require("../src/ai/agents/baseAgent");
const { AgentPermissionError } = require("../src/ai/agents/errors");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

function buildAgent() {
  return createHrAgent({
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
    tools: [],
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { invoke: jest.fn() },
    memory: null,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
  });
}

describe("HRAgent — structure", () => {
  test("name='hr_agent', instance de BaseAgent, gère uniquement l'intention 'hr'", () => {
    const agent = buildAgent();
    expect(agent).toBeInstanceOf(BaseAgent);
    expect(agent.name).toBe("hr_agent");
    expect(agent.intentNames).toEqual(["hr"]);
    expect(agent.canHandle({ name: "hr" })).toBe(true);
    expect(agent.canHandle({ name: "maintenance" })).toBe(false);
    expect(agent.canHandle({ name: "por_promesh" })).toBe(false);
  });

  test("allowedToolNames = EXACTEMENT les 9 Tools HR réels, aucun autre, aucun Tool d'un autre module", () => {
    const agent = buildAgent();
    expect(agent.allowedToolNames).toEqual(ALLOWED_TOOL_NAMES);
    expect(agent.allowedToolNames.sort()).toEqual(
      [
        "list_hr_requests",
        "get_hr_request",
        "create_hr_request",
        "accept_hr_request",
        "reject_hr_request",
        "mark_hr_request_processed",
        "add_hr_request_comment",
        "get_hr_request_history",
        "delete_hr_request",
      ].sort()
    );
  });

  test("requiredRoles=[] au niveau Agent — ouvert à tout authentifié, même discipline que maintenance_agent (le Tool restreint, pas l'Agent)", () => {
    const agent = buildAgent();
    expect(agent.requiredRoles).toEqual([]);
    expect(agent.allowedEmails).toEqual([]);
  });

  test("aucun rôle authentifié n'est refusé au niveau AGENT (accept_hr_request/reject_hr_request restent gérés au niveau Tool)", async () => {
    const agent = buildAgent();
    for (const role of ["user", "commercial", "accueil", "responsable_logistique_achat", "admin", "superadmin", "superadmin2", "finance_probar"]) {
      const result = await agent.execute({ intent: { name: "hr" }, message: "Mes demandes RH", user: { id: "u1", role }, conversationId: "c1" });
      // execute() ne lève JAMAIS AgentPermissionError pour ces rôles — la
      // preuve que le gate d'ACCÈS À L'AGENT lui-même ne refuse personne
      // (BaseAgent.execute() aurait levé avant même d'atteindre _run()).
      expect(typeof result.answer).toBe("string");
    }
  });

  test("un appelant non authentifié (sans role) est refusé (AgentPermissionError), même discipline que tous les autres Agents", async () => {
    const agent = buildAgent();
    await expect(agent.execute({ intent: { name: "hr" }, message: "x", user: null, conversationId: "c1" })).rejects.toBeInstanceOf(AgentPermissionError);
  });
});
