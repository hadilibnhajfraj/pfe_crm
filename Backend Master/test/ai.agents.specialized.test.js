"use strict";

// Covers the 8 "simple" specialized Agents (config-only over BaseAgent —
// see baseAgent.js for the shared behavior already covered in
// test/ai.agents.baseAgent.test.js): each Agent here is exercised for its
// OWN distinguishing properties — canHandle, allowed Tools whitelist,
// permissions — not the generic tool-calling/RAG-fallback mechanics.
// `ReportingAgent`/`AutomationAgent` are deliberately absent (custom `_run()`
// overrides, their own dedicated test files) — `MeetingAgent` joined them
// for the same reason (AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md/
// 30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md: a mandatory extra
// `pendingActionStore`/`createCopilotMeeting` collaborator, a custom `_run()`
// that doesn't always call the LLM) — see
// test/ai.agents.meetingAgent.*.test.js for its own comprehensive suite.

const { createAssistantAgent } = require("../src/ai/agents/assistantAgent");
const { createSearchAgent } = require("../src/ai/agents/searchAgent");
const { createCrmAssistantAgent } = require("../src/ai/agents/crmAssistantAgent");
const { createProjectAgent, ALLOWED_TOOL_NAMES: PROJECT_TOOLS } = require("../src/ai/agents/projectAgent");
const { createCommercialAgent, ALLOWED_TOOL_NAMES: COMMERCIAL_TOOLS, REQUIRED_ROLES: COMMERCIAL_ROLES } = require("../src/ai/agents/commercialAgent");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES CONTACTS" : CommercialAgent
// porte désormais, lui aussi, un cycle PendingAction (comme MeetingAgent) —
// requiert donc ce collaborateur supplémentaire. Les 5 autres Agents de ce
// describe.each ne le consomment pas, `createCommercialAgent` l'ignore
// silencieusement s'il est passé en trop (jamais un problème pour eux).
function createCommercialAgentForTest(deps) {
  return createCommercialAgent({ ...deps, pendingActionStore: new PendingActionStore() });
}
const { createPipelineAgent, ALLOWED_TOOL_NAMES: PIPELINE_TOOLS } = require("../src/ai/agents/pipelineAgent");
const { createMaintenanceAgent, ALLOWED_TOOL_NAMES: MAINTENANCE_TOOLS } = require("../src/ai/agents/maintenanceAgent");
const { createIndustrialAgent, ALLOWED_TOOL_NAMES: INDUSTRIAL_TOOLS, REQUIRED_ROLES: INDUSTRIAL_ROLES } = require("../src/ai/agents/industrialAgent");
const { createNotificationAgent, ALLOWED_TOOL_NAMES: NOTIFICATION_TOOLS } = require("../src/ai/agents/notificationAgent");
const { AgentPermissionError } = require("../src/ai/agents/errors");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

// A real (not faked) LangChainWorkflowEngine — every agent test here runs a
// single "chain" step, well within what the real engine already has
// dedicated, passing tests for (see test/ai.langchain.workflowEngine.test.js).
function realWorkflowEngine() {
  return new LangChainWorkflowEngine();
}

function toolStub(name) {
  return { name, description: `${name} description`, invoke: jest.fn(async () => `${name}-output`) };
}

const USER = { id: "u1", role: "user" };

describe.each([
  ["AssistantAgent", createAssistantAgent, "assistant_agent", ["general_chat"]],
  ["SearchAgent", createSearchAgent, "search_agent", ["documentation_question"]],
  ["CrmAssistantAgent", createCrmAssistantAgent, "crm_assistant_agent", ["documentation_question"]],
])("%s — RAG-only concierge (no Tools)", (_label, factory, expectedName, expectedIntents) => {
  test(`canHandle() matches exactly [${expectedIntents}]`, () => {
    const agent = factory({ chatModel: chatModelReturning({}), workflowEngine: realWorkflowEngine(), qaChain: { invoke: jest.fn() } });
    expect(agent.name).toBe(expectedName);
    for (const name of expectedIntents) expect(agent.canHandle({ name })).toBe(true);
    expect(agent.canHandle({ name: "maintenance" })).toBe(false);
  });

  test("never calls a Tool even if one is supplied — always answers via qaChain", async () => {
    const tool = toolStub("some_tool");
    const qaChain = { name: "qa_chain", invoke: jest.fn(async () => ({ answer: "réponse RAG", citations: [] })) };
    const agent = factory({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: realWorkflowEngine(), qaChain });

    const result = await agent.execute({ intent: { name: expectedIntents[0] }, message: "une question", user: USER, conversationId: null });

    expect(tool.invoke).not.toHaveBeenCalled();
    expect(qaChain.invoke).toHaveBeenCalled();
    expect(result.answer).toBe("réponse RAG");
  });

  test("is open to any authenticated role", () => {
    const agent = factory({ chatModel: chatModelReturning({}), workflowEngine: realWorkflowEngine(), qaChain: { invoke: jest.fn() } });
    expect(agent.requiredRoles).toEqual([]);
  });
});

describe.each([
  ["ProjectAgent", createProjectAgent, "project_agent", "projects", PROJECT_TOOLS, []],
  ["PipelineAgent", createPipelineAgent, "pipeline_agent", "pipeline", PIPELINE_TOOLS, []],
  ["MaintenanceAgent", createMaintenanceAgent, "maintenance_agent", "maintenance", MAINTENANCE_TOOLS, []],
  ["NotificationAgent", createNotificationAgent, "notification_agent", "notifications", NOTIFICATION_TOOLS, []],
  ["CommercialAgent", createCommercialAgentForTest, "commercial_agent", "commercial_contacts", COMMERCIAL_TOOLS, COMMERCIAL_ROLES],
  ["IndustrialAgent", createIndustrialAgent, "industrial_agent", "industrial", INDUSTRIAL_TOOLS, INDUSTRIAL_ROLES],
])("%s", (_label, factory, expectedName, intentName, allowedTools, requiredRoles) => {
  test(`canHandle() is exclusive to intent "${intentName}"`, () => {
    const agent = factory({ chatModel: chatModelReturning({}), workflowEngine: realWorkflowEngine() });
    expect(agent.name).toBe(expectedName);
    expect(agent.canHandle({ name: intentName })).toBe(true);
    expect(agent.canHandle({ name: "some_other_intent" })).toBe(false);
  });

  test("declares its exact, non-empty Tool whitelist", () => {
    const agent = factory({ chatModel: chatModelReturning({}), workflowEngine: realWorkflowEngine() });
    expect(agent.allowedToolNames).toEqual(allowedTools);
    expect(allowedTools.length).toBeGreaterThan(0);
  });

  test("only calls Tools present in its own whitelist, ignoring any other Tool it's handed", async () => {
    const allowed = toolStub(allowedTools[0]);
    const forbidden = toolStub("not_in_this_agents_module");
    const model = chatModelReturning({ action: "final_answer", answer: "fait" });
    const agent = factory({ chatModel: model, tools: [allowed, forbidden], workflowEngine: realWorkflowEngine() });

    const authorizedUser = requiredRoles.length ? { id: "u1", role: requiredRoles[0] } : USER;
    await agent.execute({ intent: { name: intentName }, message: "une demande", user: authorizedUser, conversationId: null });

    const [messages] = model.llmProvider.complete.mock.calls[0];
    const systemPromptSent = messages.find((m) => m.role === "system").content;
    expect(systemPromptSent).toContain(allowedTools[0]);
    expect(systemPromptSent).not.toContain("not_in_this_agents_module");
  });

  test(`permissions: requiredRoles is exactly [${requiredRoles}]`, () => {
    const agent = factory({ chatModel: chatModelReturning({}), workflowEngine: realWorkflowEngine() });
    expect(agent.requiredRoles).toEqual(requiredRoles);
  });

  if (requiredRoles.length) {
    test("denies a role outside its own requiredRoles", async () => {
      const agent = factory({ chatModel: chatModelReturning({}), tools: [toolStub(allowedTools[0])], workflowEngine: realWorkflowEngine() });
      await expect(
        agent.execute({ intent: { name: intentName }, message: "m", user: { id: "u1", role: "user" }, conversationId: null })
      ).rejects.toThrow(AgentPermissionError);
    });
  }
});
