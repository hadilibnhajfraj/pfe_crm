"use strict";

const { createReportingAgent, ReportingAgent, ALLOWED_TOOL_NAMES } = require("../src/ai/agents/reportingAgent");
const { ConfigurationError } = require("../src/ai/agents/errors");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER = { id: "u1", role: "user" };

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

describe("ReportingAgent construction", () => {
  test("requires a summarizationChain", () => {
    expect(() =>
      createReportingAgent({ chatModel: chatModelReturning({}), tools: [], workflowEngine: new LangChainWorkflowEngine() })
    ).toThrow(ConfigurationError);
  });
});

describe("ReportingAgent — two-step workflow (tool-calling then summarization)", () => {
  test("canHandle is exclusive to 'reporting'", () => {
    const agent = createReportingAgent({
      chatModel: chatModelReturning({}),
      workflowEngine: new LangChainWorkflowEngine(),
      summarizationChain: { invoke: jest.fn() },
    });
    expect(agent.canHandle({ name: "reporting" })).toBe(true);
    expect(agent.canHandle({ name: "dashboard" })).toBe(false);
  });

  test("declares the same Tools as KPIAgent (dashboard module) but uses them for a summary, not a direct answer", async () => {
    const model = chatModelReturning({ action: "final_answer", answer: JSON.stringify({ kpi: 42 }) });
    const summarizationChain = { name: "summarization_chain", invoke: jest.fn(async ({ text, focus }) => ({ summary: `Synthèse (${focus}): ${text}` })) };
    const tool = { name: ALLOWED_TOOL_NAMES[0], description: "d", invoke: jest.fn(async () => "tool-output") };

    const agent = createReportingAgent({
      chatModel: model,
      tools: [tool],
      workflowEngine: new LangChainWorkflowEngine(),
      summarizationChain,
    });

    const result = await agent.execute({ intent: { name: "reporting" }, message: "fais-moi un rapport", user: USER, conversationId: null });

    expect(summarizationChain.invoke.mock.calls[0][0]).toEqual({ text: JSON.stringify({ kpi: 42 }), focus: expect.any(String) });
    expect(result.answer).toContain("Synthèse");
    expect(result.answer).toContain('{"kpi":42}');
  });

  test("gestion des erreurs: no allowed Tool available degrades gracefully rather than throwing", async () => {
    const agent = createReportingAgent({
      chatModel: chatModelReturning({}),
      tools: [],
      workflowEngine: new LangChainWorkflowEngine(),
      summarizationChain: { invoke: jest.fn() },
    });
    const result = await agent.execute({ intent: { name: "reporting" }, message: "un rapport", user: USER, conversationId: null });
    expect(result.answer).toContain("reporting_agent");
  });

  test("is an instance of ReportingAgent (custom _run) not a plain BaseAgent", () => {
    const agent = createReportingAgent({
      chatModel: chatModelReturning({}),
      workflowEngine: new LangChainWorkflowEngine(),
      summarizationChain: { invoke: jest.fn() },
    });
    expect(agent).toBeInstanceOf(ReportingAgent);
  });
});
