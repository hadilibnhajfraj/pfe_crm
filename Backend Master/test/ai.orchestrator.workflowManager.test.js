"use strict";

const { WorkflowManager } = require("../src/ai/orchestrator/workflowManager");
const { OrchestratorError } = require("../src/ai/orchestrator/errors");
const { ToolCallingChain } = require("../src/ai/langchain/chains");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");

// A minimal stand-in for LangChainWorkflowEngine: just runs the (single)
// step it's given, exactly like the real engine's `_runChainStep` would —
// enough to prove WorkflowManager builds the *right* step, without pulling
// in @langchain/core's RunnableLambda machinery for a unit test.
function fakeWorkflowEngine() {
  return {
    run: jest.fn(async (steps, state) => {
      const step = steps[0];
      const input = step.buildInput ? step.buildInput(state) : state;
      const output = await step.chain.invoke(input);
      return { ...state, [step.outputKey]: output };
    }),
  };
}

function fakeChatModel(reply) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => reply) } });
}

describe("WorkflowManager", () => {
  test("throws OrchestratorError for an empty message, without touching the workflow engine", async () => {
    const workflowEngine = fakeWorkflowEngine();
    const manager = new WorkflowManager({ chatModel: fakeChatModel("x"), qaChain: { invoke: jest.fn() }, workflowEngine });
    await expect(manager.run({ intent: { requiresTools: false }, message: "   ", tools: [] })).rejects.toThrow(OrchestratorError);
    expect(workflowEngine.run).not.toHaveBeenCalled();
  });

  test("runs the qaChain (RAG path) when the intent does not require tools", async () => {
    const workflowEngine = fakeWorkflowEngine();
    const qaChain = { name: "qa_chain", invoke: jest.fn(async ({ question }) => ({ answer: `réponse à: ${question}`, citations: [{ index: 1 }] })) };
    const manager = new WorkflowManager({ chatModel: fakeChatModel("unused"), qaChain, workflowEngine });

    const result = await manager.run({ intent: { requiresTools: false }, message: "comment ça marche ?", user: { id: "u1" }, conversationId: "c1", tools: [] });

    expect(qaChain.invoke).toHaveBeenCalledWith({ question: "comment ça marche ?", user: { id: "u1" }, scope: { conversationId: "c1" } });
    expect(result).toEqual({ mode: "qa", answer: "réponse à: comment ça marche ?", citations: [{ index: 1 }], toolSteps: [] });
  });

  test("runs the qaChain when the intent requires tools but none were selected (no candidate tool for that module)", async () => {
    const workflowEngine = fakeWorkflowEngine();
    const qaChain = { name: "qa_chain", invoke: jest.fn(async () => ({ answer: "repli RAG", citations: [] })) };
    const manager = new WorkflowManager({ chatModel: fakeChatModel("unused"), qaChain, workflowEngine });

    const result = await manager.run({ intent: { requiresTools: true }, message: "une demande", tools: [] });
    expect(result.mode).toBe("qa");
    expect(qaChain.invoke).toHaveBeenCalled();
  });

  test("builds a ToolCallingChain scoped to the given tools and runs it when the intent requires tools", async () => {
    const workflowEngine = fakeWorkflowEngine();
    const model = fakeChatModel(JSON.stringify({ action: "final_answer", answer: "42" }));
    const tool = { name: "get_dashboard_kpis", description: "KPIs", invoke: jest.fn() };
    const manager = new WorkflowManager({ chatModel: model, qaChain: { invoke: jest.fn() }, workflowEngine, maxToolCalls: 3 });

    const result = await manager.run({ intent: { requiresTools: true }, message: "montre-moi les kpis", tools: [tool] });

    expect(workflowEngine.run).toHaveBeenCalledTimes(1);
    const [steps] = workflowEngine.run.mock.calls[0];
    expect(steps[0].chain).toBeInstanceOf(ToolCallingChain);
    expect(steps[0].chain.toolsByName.has("get_dashboard_kpis")).toBe(true);
    expect(steps[0].chain.maxToolCalls).toBe(3);
    expect(result).toEqual({ mode: "tool_calling", answer: "42", citations: [], toolSteps: [] });
  });
});
