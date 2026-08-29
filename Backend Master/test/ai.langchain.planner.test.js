"use strict";

const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LlmPlanner } = require("../src/ai/langchain/planner");
const { PlanningError } = require("../src/ai/langchain/errors");

function modelReturning(payload) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(payload)) } });
}

const AVAILABLE_TOOLS = [{ name: "get_dashboard_kpis", description: "Dashboard KPIs" }];

describe("LlmPlanner.plan", () => {
  test("throws PlanningError for an empty goal", async () => {
    const planner = new LlmPlanner({ chatModel: modelReturning({ steps: [] }) });
    await expect(planner.plan("")).rejects.toThrow(PlanningError);
  });

  test("returns the validated steps when every referenced tool is available", async () => {
    const planner = new LlmPlanner({
      chatModel: modelReturning({ steps: [{ tool: "get_dashboard_kpis", input: {}, reason: "show kpis" }] }),
    });
    const plan = await planner.plan("show me kpis", { availableTools: AVAILABLE_TOOLS });
    expect(plan).toEqual([{ tool: "get_dashboard_kpis", input: {}, reason: "show kpis" }]);
  });

  test("keeps steps with tool: null (no tool needed for that step)", async () => {
    const planner = new LlmPlanner({
      chatModel: modelReturning({ steps: [{ tool: null, input: {}, reason: "think" }] }),
    });
    const plan = await planner.plan("just think about it", { availableTools: AVAILABLE_TOOLS });
    expect(plan).toEqual([{ tool: null, input: {}, reason: "think" }]);
  });

  test("drops steps referencing a tool that isn't in availableTools", async () => {
    const planner = new LlmPlanner({
      chatModel: modelReturning({
        steps: [
          { tool: "get_dashboard_kpis", input: {}, reason: "ok" },
          { tool: "made_up_tool", input: {}, reason: "should be dropped" },
        ],
      }),
    });
    const plan = await planner.plan("goal", { availableTools: AVAILABLE_TOOLS });
    expect(plan).toEqual([{ tool: "get_dashboard_kpis", input: {}, reason: "ok" }]);
  });

  test("throws PlanningError when every step is dropped by validation", async () => {
    const planner = new LlmPlanner({
      chatModel: modelReturning({ steps: [{ tool: "made_up_tool", input: {}, reason: "x" }] }),
    });
    await expect(planner.plan("goal", { availableTools: AVAILABLE_TOOLS })).rejects.toThrow(PlanningError);
  });

  test("throws PlanningError when the model output has no 'steps' array", async () => {
    const planner = new LlmPlanner({ chatModel: modelReturning({ notSteps: [] }) });
    await expect(planner.plan("goal")).rejects.toThrow(PlanningError);
  });

  test("throws PlanningError when the model output is not valid JSON", async () => {
    const planner = new LlmPlanner({ chatModel: new LlmProviderChatModel({ llmProvider: { complete: async () => "not json" } }) });
    await expect(planner.plan("goal")).rejects.toThrow(PlanningError);
  });

  test("truncates the plan to maxSteps", async () => {
    const manySteps = Array.from({ length: 10 }, (_, i) => ({ tool: null, input: {}, reason: `step ${i}` }));
    const planner = new LlmPlanner({ chatModel: modelReturning({ steps: manySteps }), maxSteps: 3 });
    const plan = await planner.plan("goal");
    expect(plan).toHaveLength(3);
  });

  test("defaults missing input/reason to {} and '' respectively", async () => {
    const planner = new LlmPlanner({ chatModel: modelReturning({ steps: [{ tool: null }] }) });
    const plan = await planner.plan("goal");
    expect(plan).toEqual([{ tool: null, input: {}, reason: "" }]);
  });
});
